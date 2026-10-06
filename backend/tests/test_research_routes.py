import unittest
import inspect
import json
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

import main
from account_store import AccountStore
from pydantic import ValidationError


class ResearchRouteTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.store = AccountStore(Path(self.temp_dir.name) / "accounts.sqlite3")
        self.store_patch = patch.object(main, "account_store", self.store)
        self.store_patch.start()
        self.auth_secret_patch = patch.dict(
            "os.environ",
            {"CHILDSAFELENS_AUTH_SECRET": "research-route-tests-secret-32-bytes-minimum"},
        )
        self.auth_secret_patch.start()
        self.route_patchers = []
        for name in (
            "get_child_profiles",
            "create_child_profile",
            "get_events",
            "get_analytics",
            "create_incident",
            "get_incidents",
            "get_child_risk",
            "get_child_timeline",
            "get_child_social_graph",
            "get_incident_explanation",
            "parent_allow",
            "parent_block",
            "parent_edit",
        ):
            endpoint = getattr(main, name)
            patcher = patch.object(
                main,
                name,
                self._authenticated_route(endpoint),
            )
            patcher.start()
            self.route_patchers.append(patcher)
        main._incidents.clear()
        main._events.clear()
        self.notify_patch = patch.object(
            main.notification_service, "notify_parent", lambda _: None
        )
        self.notify_patch.start()

    def tearDown(self):
        self.notify_patch.stop()
        for patcher in reversed(self.route_patchers):
            patcher.stop()
        self.auth_secret_patch.stop()
        self.store_patch.stop()
        self.temp_dir.cleanup()
        main._incidents.clear()
        main._events.clear()

    @staticmethod
    def _authenticated_route(endpoint):
        def invoke(*args, **kwargs):
            authenticated_email = kwargs.pop("authenticated_email", None)
            bound = inspect.signature(endpoint).bind_partial(*args, **kwargs)
            parent_email = bound.arguments.get("parentEmail")
            incident_request = bound.arguments.get("inc")
            request_model = bound.arguments.get("req")
            if parent_email is None and incident_request is not None:
                parent_email = incident_request.parentEmail
            if parent_email is None and request_model is not None:
                parent_email = getattr(request_model, "parentEmail", None)
            if parent_email is None:
                incident_id = bound.arguments.get("incident_id")
                incident = main._incidents.get(incident_id)
                if incident is not None:
                    parent_email = incident.get("parentEmail")
            if authenticated_email is None:
                if parent_email is None:
                    raise AssertionError(
                        f"Unable to determine parent for {endpoint.__name__}"
                    )
                authenticated_email = main.account_store.normalize_email(parent_email)
            return endpoint(
                *args,
                authenticated_email=authenticated_email,
                **kwargs,
            )

        return invoke

    def test_auth_secret_falls_back_to_dev_secret_when_not_configured(self):
        with patch.dict("os.environ", {}, clear=True):
            self.assertEqual(main._auth_secret(), b"childsafelens-local-dev-auth-secret-32bytes")

    def test_empty_analytics_has_no_seeded_demo_counts(self):
        result = main.get_analytics(
            childId="child-with-no-incidents",
            parentEmail="parent@test.com",
        )

        self.assertEqual(result["total_incidents"], 0)
        self.assertEqual(result["high_risk"], 0)
        self.assertEqual(result["medium_risk"], 0)
        self.assertEqual(result["low_risk"], 0)
        self.assertIsNone(result["repeated_senders"])

    def test_parent_authentication_and_child_profile_are_shared_per_account(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            store = AccountStore(Path(temp_dir) / "accounts.sqlite3")
            with patch.object(main, "account_store", store):
                request = main.ParentAuthRequest(
                    email="parent@example.com",
                    password="secure-pass",
                    fullName="Parent",
                )
                main.register_parent(request)
                authenticated = main.login_parent(request)
                profile = main.create_child_profile(
                    main.ChildProfileRequest(
                        parentEmail="PARENT@example.com",
                        childName="Child One",
                    )
                )
                profiles = main.get_child_profiles("parent@example.com")

                self.assertEqual(authenticated["email"], "parent@example.com")
                self.assertEqual(profile["childName"], "Child One")
                self.assertEqual([item["childName"] for item in profiles], ["Child One"])
                with self.assertRaises(main.HTTPException) as error:
                    main.login_parent(
                        main.ParentAuthRequest(
                            email="parent@example.com",
                            password="wrong-pass",
                        )
                    )
                self.assertEqual(error.exception.status_code, 401)

    def test_existing_text_prediction_contract_is_unchanged(self):
        with patch(
            "main.predict_text",
            return_value={
                "risk_score": 0.2,
                "label": "low_risk",
                "is_risky": False,
                "stage1_label": "Clean",
                "stage1_status": "available",
                "classification_label": "Clean",
                "classification_confidence": 0.9,
                "model_status": "dummy",
                "model_version": "dummy-dev",
                "development_simulation": True,
                "classification_notice": "DEVELOPMENT/SIMULATION ONLY",
                "category": None,
                "category_status": "skipped_clean",
                "stage": "Early exit (Clean)",
            },
        ):
            result = main.predict(main.PredictRequest(text="A neutral greeting"))

        self.assertGreaterEqual(result.risk_score, 0)
        self.assertLessEqual(result.risk_score, 1)
        self.assertIn(result.label, {"low_risk", "medium_risk", "high_risk"})
        self.assertEqual(result.stage1_label, "Clean")
        self.assertEqual(result.model_status, "dummy")
        self.assertEqual(result.model_version, "dummy-dev")
        self.assertTrue(result.development_simulation)
        self.assertEqual(result.category_status, "skipped_clean")
        self.assertIsNone(result.category)
        self.assertEqual(result.modality, "text")
        self.assertIsNotNone(result.timestamp)
        self.assertEqual(result.processing_status, "development_simulation")

    def test_predict_returns_cascade_category_for_bullying(self):
        with patch(
            "main.predict_text",
            return_value={
                "risk_score": 0.35,
                "label": "medium_risk",
                "is_risky": True,
                "stage1_label": "Bullying",
                "stage1_status": "available",
                "classification_label": "Bullying",
                "classification_confidence": 0.9,
                "model_status": "dummy",
                "model_version": "dummy-dev",
                "development_simulation": True,
                "classification_notice": "DEVELOPMENT/SIMULATION ONLY",
                "category": "Insult",
                "category_status": "predicted",
                "stage": "Stage 1 passed -> Stage 2 category head",
            },
        ):
            result = main.predict(main.PredictRequest(text="test input"))

        self.assertTrue(result.is_risky)
        self.assertEqual(result.label, "medium_risk")
        self.assertEqual(result.stage1_label, "Bullying")
        self.assertTrue(result.development_simulation)
        self.assertEqual(result.category, "Insult")
        self.assertEqual(result.category_status, "predicted")

    def test_predict_preserves_exact_probability_and_returns_text_evidence(self):
        probability = 0.9533061385154724
        prediction = {
            "risk_score": probability,
            "p_bullying": probability,
            "label": "high_risk",
            "is_risky": True,
            "stage1_label": "Bullying",
            "stage1_status": "available",
            "classification_label": "Bullying",
            "classification_confidence": probability,
            "model_status": "real",
            "model_version": "cyberbullying-cascade-v4",
            "development_simulation": False,
            "classification_notice": "Supplied cascade classifier.",
            "category": "Threat",
            "category_status": "predicted",
            "stage": "Stage 1 passed -> Stage 2 category head",
        }
        with patch("main.predict_text", return_value=prediction):
            result = main.predict(
                main.PredictRequest(
                    text="Aarav, I will hurt you",
                    child_name="Aarav",
                )
            )

        self.assertEqual(result.p_bullying, probability)
        self.assertEqual(result.risk_score, probability)
        self.assertEqual(result.model_version, "cyberbullying-cascade-v4")
        self.assertEqual(result.category, "Threat")
        self.assertTrue(result.text_evidence_available)
        self.assertIn(
            "child_name_reference",
            result.targeting_evidence["supporting_evidence"],
        )
        self.assertIn("threat", result.severity_evidence["indicators"])
        self.assertFalse(any(
            incident.get("messageSnippet") == "Aarav, I will hurt you"
            for incident in main._incidents.values()
        ))

    def test_clean_current_text_completes_deterministic_risk_without_creating_incident(self):
        email = "current-message-parent@example.com"
        self.store.create_account(email, "password123", "Parent")
        profile = self.store.add_child_profile(email, "Aarav")
        probability = 0.04548333212733269
        prediction = {
            "risk_score": probability,
            "p_bullying": probability,
            "label": "low_risk",
            "is_risky": False,
            "stage1_label": "Clean",
            "stage1_status": "available",
            "classification_label": "Clean",
            "classification_confidence": 1 - probability,
            "model_status": "real",
            "model_version": "cyberbullying-cascade-v4",
            "development_simulation": False,
            "classification_notice": "Supplied cascade classifier.",
            "category": None,
            "category_status": "skipped_clean",
            "stage": "Early exit (Clean)",
        }
        with patch("main.predict_text", return_value=prediction):
            result = main.predict(main.PredictRequest(text="Hey, how are you?"))

        current_analysis = {
            "classification": result.classification_label,
            "probability": result.p_bullying,
            "category": result.category,
            "model_version": result.model_version,
            "text_status": "available" if result.text_evidence_available else "not_provided",
            "targeting_evidence": result.targeting_evidence["supporting_evidence"],
            "severity_evidence": result.severity_evidence["indicators"],
            "targeting_score": result.targeting_evidence["score"],
            "severity_score": result.severity_evidence["score"],
            "targeting_signals": result.targeting_evidence["indicators"],
            "analyzed_at": result.timestamp,
        }
        assessment = main.get_child_risk(
            profile["child_id"],
            email,
            currentAnalysis=json.dumps(current_analysis),
        )

        self.assertEqual(result.classification_label, "Clean")
        self.assertFalse(result.incident_created)
        self.assertEqual(assessment["incident_count"], 0)
        self.assertEqual(assessment["current_message"]["classification"], "Clean")
        self.assertEqual(assessment["components"]["severity"]["value"], 0.0)
        self.assertEqual(assessment["components"]["classifier_probability"]["value"], probability)
        self.assertEqual(assessment["multimodal_evidence"]["text"], "available")
        self.assertEqual(assessment["multimodal_evidence"]["image"], "not_provided")
        self.assertEqual(assessment["multimodal_evidence"]["audio"], "not_provided")
        self.assertEqual(assessment["multimodal_evidence"]["video"], "not_provided")
        self.assertIsInstance(assessment["crs"], int)

    def test_unavailable_model_returns_503_without_creating_incident(self):
        with patch(
            "main.predict_text",
            side_effect=main.ModelUnavailableError("model unavailable"),
        ):
            with self.assertRaises(main.HTTPException) as error:
                main.predict(main.PredictRequest(text="you are an idiot"))

        self.assertEqual(error.exception.status_code, 503)
        self.assertEqual(
            error.exception.detail["classification_status"],
            "MODEL_UNAVAILABLE",
        )
        self.assertFalse(any(
            incident.get("messageSnippet") == "you are an idiot"
            for incident in main._incidents.values()
        ))

    def test_research_status_reports_cascade_category_classifier(self):
        status = main.get_research_status()

        self.assertIn(status["classifier"]["status"], {"dummy", "real"})
        if status["classifier"]["status"] == "dummy":
            self.assertEqual(status["classifier"]["model_version"], "dummy-dev")
            self.assertTrue(status["classifier"]["development_simulation"])
            self.assertIn("not research results", status["classification_disclaimer"])
        else:
            self.assertEqual(
                status["classifier"]["model_version"], "cyberbullying-cascade-v4"
            )
            self.assertFalse(status["classifier"]["development_simulation"])
            self.assertFalse(status["classifier"]["validated"])
        self.assertEqual(status["category_classifier"]["status"], "available")
        self.assertTrue(status["category_classifier"]["artifact_present"])
        self.assertIn("Threat", status["category_classifier"]["categories"])
        self.assertEqual(status["history_storage"], "sqlite")
        self.assertEqual(
            status["explainability"]["message"],
            "Explanation unavailable",
        )
        self.assertEqual(status["risk_fusion"]["status"], "training_target_unavailable")
        self.assertFalse(status["risk_fusion"]["training_target_available"])
        self.assertEqual(
            status["risk_fusion"]["target_message"],
            "XGBoost requires a research-defined training target.",
        )

    def test_log_event_preserves_dummy_simulation_metadata(self):
        result = main.log_event(
            main.LogEventRequest(
                risk_level="high_risk",
                model_status="dummy",
                model_version="dummy-dev",
                development_simulation=True,
            )
        )

        self.assertEqual(result["status"], "ok")
        self.assertEqual(main._events[-1]["model_status"], "dummy")
        self.assertEqual(main._events[-1]["model_version"], "dummy-dev")
        self.assertTrue(main._events[-1]["development_simulation"])
        self.assertEqual(self.store.list_risk_events()[-1]["event_id"], result["event_id"])
        self.assertEqual(self.store.list_risk_events()[-1]["processing_status"], "dummy")

    def test_events_preserves_existing_incident_aggregation_contract(self):
        main._incidents.update(
            {
                "event-high": {
                    "riskLevel": "HIGH_RISK",
                    "parentEmail": "events-parent@example.com",
                    "childName": "Child",
                    "childId": "events-child",
                    "classification": "CYBERBULLYING",
                },
                "event-medium": {
                    "riskLevel": "medium_risk",
                    "parentEmail": "events-parent@example.com",
                    "childName": "Child",
                    "childId": "events-child",
                    "classification": "CYBERBULLYING",
                },
                "event-low": {
                    "riskLevel": "low_risk",
                    "parentEmail": "other-parent@example.com",
                    "childName": "Other",
                },
            }
        )
        result = main.get_events(
            parentEmail="events-parent@example.com",
            childId="events-child",
        )

        self.assertEqual(
            result,
            {
                "total_events": 2,
                "high_risk_count": 1,
                "medium_risk_count": 1,
                "low_risk_count": 0,
            },
        )

    def test_incident_storage_survives_reopen_and_persists_parent_actions(self):
        incident = main.IncidentCreate(
            incidentId="persistent-incident",
            parentEmail="Persistent.Parent@example.com",
            childId="persistent-child",
            childName="Casey",
            type="OUTGOING",
            messageSnippet="Please stop",
            messageText="Please stop sending those messages",
            riskScore=0.2,
            riskLevel="high_risk",
            category="ignored-category",
            packageName="test",
            timestamp=1_791_138_000_000,
            contentType="image",
            evidenceReference="opaque_reference_12345678901234567890",
        )
        with patch("main.predict_text", return_value=self._bullying_prediction()):
            main.create_incident(incident)

        stored = self.store.get_incident("persistent-incident")
        self.assertIsNotNone(stored)
        self.assertNotIn("messageText", stored)
        self.assertEqual(stored["messageSnippet"], "Please stop")
        self.assertEqual(
            stored["evidenceReference"],
            "opaque_reference_12345678901234567890",
        )
        self.assertEqual(stored["classifierOutput"]["modality"], "text")
        self.assertEqual(stored["classifierOutput"]["modelVersion"], "cyberbullying-cascade-v4")
        self.assertIsNotNone(stored["classifierOutput"]["timestamp"])
        self.assertEqual(stored["classifierOutput"]["processingStatus"], "completed")
        self.assertEqual(stored["multimodalAnalysis"]["modality"], "image")
        self.assertEqual(stored["multimodalAnalysis"]["processingStatus"], "not_implemented")
        self.assertIsNone(stored["multimodalScore"])

        main.parent_allow("persistent-incident")
        reopened = AccountStore(self.store.database_path)
        self.assertEqual(
            reopened.get_incident("persistent-incident")["parentDecision"],
            "ALLOW",
        )
        self.assertEqual(
            reopened.get_incident("persistent-incident")["parentAction"],
            "ALLOW",
        )

        main._incidents.clear()
        main._incidents.update(
            {
                item["incidentId"]: item
                for item in reopened.list_incidents(
                    parent_email="PERSISTENT.PARENT@example.com"
                )
            }
        )
        result = main.get_incidents(parentEmail="persistent.parent@example.com")
        self.assertEqual([item["incidentId"] for item in result], ["persistent-incident"])
        assessment = main.get_child_risk(
            "persistent-child",
            "persistent.parent@example.com",
        )
        persisted_snapshot = reopened.get_incident("persistent-incident")
        self.assertNotEqual(assessment["risk_state"], "Not available")
        self.assertIsInstance(persisted_snapshot["CRS"], (int, float))
        self.assertEqual(
            persisted_snapshot["riskFusionOutput"]["processingStatus"],
            "computed_research_deterministic",
        )
        self.assertEqual(
            persisted_snapshot["riskFusionOutput"]["method"],
            "research_derived_deterministic",
        )
        self.assertEqual(
            persisted_snapshot["shapExplanation"]["message"],
            "Explanation unavailable",
        )
        self.assertIsNotNone(persisted_snapshot["riskAssessmentTimestamp"])

    def test_evidence_reference_rejects_paths_and_urls(self):
        for reference in ("C:/private/image.jpg", "https://example.com/image.jpg"):
            with self.subTest(reference=reference):
                with self.assertRaises(ValidationError):
                    main.IncidentCreate(
                        incidentId="invalid-evidence",
                        type="INCOMING",
                        messageSnippet="snippet",
                        riskScore=0.2,
                        riskLevel="high_risk",
                        category="none",
                        packageName="test",
                        timestamp=1_791_138_000_000,
                        evidenceReference=reference,
                    )

    def test_alert_endpoint_requires_backend_environment_secret(self):
        request = main.AlertRequest(
            deviceId="device",
            type="OTHER",
            appPackage="test.package",
            score=0.2,
            timestamp=1_791_138_000_000,
            parentEmail="parent@example.com",
            parentPhone="",
            emailEnabled=False,
            smsEnabled=False,
        )
        with patch.dict("os.environ", {"API_KEY": ""}):
            with self.assertRaises(main.HTTPException) as missing:
                main.post_alert(request, None)
        self.assertEqual(missing.exception.status_code, 503)

        with patch.dict("os.environ", {"API_KEY": "test-only-secret"}):
            with self.assertRaises(main.HTTPException) as invalid:
                main.post_alert(request, "wrong-secret")
        self.assertEqual(invalid.exception.status_code, 401)

    def test_multimodal_routes_surface_unavailable_provider_without_side_effects(self):
        route_cases = (
            (main.analyze_audio, "audio"),
            (main.analyze_image, "image"),
            (main.analyze_video, "video"),
        )
        initial_incident_count = len(main._incidents)
        for handler, modality in route_cases:
            with self.subTest(modality=modality):
                with self.assertRaises(main.HTTPException) as error:
                    handler(main.MediaAnalysisRequest(media_reference="asset-ref"))
                self.assertEqual(error.exception.status_code, 503)
                self.assertEqual(
                    error.exception.detail["processing_status"],
                    f"{modality}_analysis_unavailable",
                )
                self.assertEqual(error.exception.detail["status"], "unavailable")
                self.assertIn("no result was produced", error.exception.detail["message"])
        self.assertEqual(len(main._incidents), initial_incident_count)

    def test_multimodal_routes_reject_blank_media_references(self):
        for handler in (main.analyze_audio, main.analyze_image, main.analyze_video):
            with self.subTest(handler=handler.__name__):
                with self.assertRaises(main.HTTPException) as error:
                    handler(main.MediaAnalysisRequest(media_reference="  "))
                self.assertEqual(error.exception.status_code, 422)

    def test_existing_routes_remain_registered(self):
        registered = {
            (method, route.path)
            for route in main.app.routes
            for method in getattr(route, "methods", set())
        }
        for route in (
            ("POST", "/predict"),
            ("POST", "/log-event"),
            ("GET", "/events"),
            ("GET", "/children/{child_id}/risk"),
            ("GET", "/children/{child_id}/timeline"),
            ("GET", "/incidents/{incident_id}/explanation"),
            ("POST", "/analyze/audio"),
            ("POST", "/analyze/image"),
            ("POST", "/analyze/video"),
        ):
            with self.subTest(route=route):
                self.assertIn(route, registered)

    def test_timeline_uses_actual_incident_prefixes_and_risk_assessments(self):
        first = {
            "incidentId": "timeline-first",
            "childId": "timeline-child",
            "parentEmail": "timeline-parent@example.com",
            "childName": "Child",
            "classification": "CYBERBULLYING",
            "timestamp": 1_791_138_000_000,
            "status": "PENDING_PARENT_REVIEW",
        }
        second = {
            "incidentId": "timeline-second",
            "childId": "timeline-child",
            "parentEmail": "timeline-parent@example.com",
            "childName": "Child",
            "classification": "CYBERBULLYING",
            "timestamp": 1_791_224_400_000,
            "status": "PENDING_PARENT_REVIEW",
        }
        main._incidents[first["incidentId"]] = first
        main._incidents[second["incidentId"]] = second
        observed_prefixes = []

        def assessment(prefix, child_id, now):
            observed_prefixes.append((list(prefix), child_id, now))
            return {
                "crs": None,
                "risk_state": "Not available",
                "status": "training_target_unavailable",
                "components": {
                    "temporal": {"value": None},
                    "escalation": {"value": None},
                    "historical": {"value": None},
                },
                "social_graph": {"graph_score": None},
                "risk_fusion": {
                    "status": "training_target_unavailable",
                    "score": None,
                    "model_version": None,
                    "explanation": {
                        "status": "unavailable",
                        "message": "Explanation unavailable",
                        "feature_contributions": None,
                    },
                },
            }

        with patch("main.child_risk_assessment", side_effect=assessment):
            timeline = main.get_child_timeline(
                "timeline-child",
                "timeline-parent@example.com",
            )

        self.assertEqual(
            [len(prefix) for prefix, _, _ in observed_prefixes],
            [1, 2],
        )
        self.assertEqual(
            [entry["incident_id"] for entry in timeline["timeline"]],
            ["timeline-first", "timeline-second"],
        )
        self.assertEqual(
            [entry["status"] for entry in timeline["timeline"]],
            ["training_target_unavailable"] * 2,
        )

    def test_incident_explanation_uses_risk_fusion_explanation_contract(self):
        incident = {
            "incidentId": "explained-incident",
            "childId": "explained-child",
            "parentEmail": "explanation-parent@example.com",
            "childName": "Child",
            "classification": "CYBERBULLYING",
            "timestamp": 1_791_138_000_000,
            "status": "PENDING_PARENT_REVIEW",
            "parentDecision": "ALLOW",
        }
        main._incidents[incident["incidentId"]] = incident
        expected_contributions = [
            {"feature": "incident_score", "value": 0.2}
        ]
        with patch(
            "main.child_risk_assessment",
            return_value={
                "crs": 30.0,
                "risk_state": "WARNING",
                "status": "computed",
                "components": {
                    "temporal": {"value": 0.1},
                    "escalation": {"value": 0.1},
                    "historical": {"value": 0.1},
                },
                "social_graph": {"graph_score": 0.1},
                "risk_fusion": {
                    "status": "computed",
                    "score": 0.3,
                    "model_version": "xgboost:test",
                    "explanation": {
                        "status": "computed",
                        "message": "SHAP TreeExplainer",
                        "feature_contributions": expected_contributions,
                        "base_value": 0.1,
                        "explained_output": 0.3,
                        "model_output": "raw_margin",
                    },
                },
            },
        ):
            result = main.get_incident_explanation(
                incident["incidentId"],
                "explanation-parent@example.com",
            )

        self.assertEqual(result["status"], "computed")
        self.assertEqual(result["shap_values"], expected_contributions)
        self.assertEqual(result["contributors"], expected_contributions)
        self.assertEqual(result["base_value"], 0.1)
        self.assertEqual(result["explained_output"], 0.3)
        self.assertEqual(result["model_output"], "raw_margin")
        self.assertEqual(result["parent_action"], "ALLOW")

    def test_child_risk_assessment_excludes_dummy_score_from_research_components(self):
        with patch(
            "research_risk.classifier_status",
            return_value={
                "status": "dummy",
                "model_version": "dummy-dev",
                "development_simulation": True,
            },
        ):
            assessment = main.get_child_risk("child-1", "parent@test.com")

        self.assertIsNone(assessment["crs"])
        self.assertEqual(assessment["risk_state"], "Not available")
        self.assertEqual(
            assessment["components"]["classifier_probability"]["status"],
            "dummy_development_simulation",
        )
        self.assertEqual(assessment["classifier"]["status"], "dummy")
        self.assertIsNone(assessment["components"]["classifier_probability"]["value"])

    def test_incident_creation_persists_supplied_category_prediction(self):
        incident = main.IncidentCreate(
            incidentId="research-test-incident",
            parentEmail="parent@test.com",
            childId="child-1",
            childName="Aarav",
            type="OUTGOING",
            messageSnippet="@aarav, stop",
            riskScore=0.7,
            riskLevel="high_risk",
            category="harassment",
            packageName="test",
            timestamp=1_791_138_000_000,
            senderId="sender-1",
            childUsername="aarav",
            replyToChild=True,
            severityIndicators=["threat"],
        )
        with patch("main.predict_text", return_value=self._bullying_prediction()):
            main.create_incident(incident)

        self.assertEqual(main._incidents[incident.incidentId].get("category"), "Insult")
        self.assertEqual(
            main._incidents[incident.incidentId]["classifierOutput"]["output"]["categories"],
            [{"name": "Insult", "prob": 0.88}],
        )

    def test_incident_creation_resolves_android_display_name_to_profile_id(self):
        email = "legacy-child-id@example.com"
        self.store.create_account(email, "password123", "Parent")
        profile = self.store.add_child_profile(email, "Aarav")
        incident = main.IncidentCreate(
            incidentId="legacy-child-id-incident",
            parentEmail=email,
            childId="Aarav",
            childName="Aarav",
            type="INCOMING",
            messageSnippet="you are an idiot",
            messageText="you are an idiot",
            riskScore=0.01,
            riskLevel="low_risk",
            category="ignored-client-category",
            packageName="test",
            timestamp=1_791_138_000_000,
        )

        with patch("main.predict_text", return_value=self._bullying_prediction()):
            main.create_incident(incident)

        self.assertEqual(
            main._incidents[incident.incidentId]["childId"],
            profile["child_id"],
        )

    def test_text_only_bullying_incident_analyzes_targeting_and_severity(self):
        incident = main.IncidentCreate(
            incidentId="text-only-evidence-test",
            parentEmail="parent@test.com",
            childId="child-1",
            childName="Aarav",
            type="INCOMING",
            messageSnippet="You are so stupid",
            messageText="You are so stupid",
            riskScore=0.2,
            riskLevel="low_risk",
            category="ignored-client-category",
            packageName="test",
            timestamp=1_791_138_000_000,
            contentType="text",
        )
        with patch(
            "main.predict_text",
            return_value=self._bullying_prediction(),
        ) as classifier:
            response = main.create_incident(incident)

        stored = main._incidents[incident.incidentId]
        classifier.assert_called_once_with("You are so stupid")
        self.assertEqual(response["status"], "ok")
        self.assertEqual(stored["classifierOutput"]["output"]["label"], "Bullying")
        self.assertEqual(stored["targeting_evidence"]["analysis_status"], "completed")
        self.assertEqual(stored["targeting_evidence"]["status"], "computed")
        self.assertEqual(
            stored["targeting_evidence"]["indicators"]["second_person_reference"],
            True,
        )
        self.assertEqual(stored["severity_evidence"]["analysis_status"], "completed")
        self.assertEqual(stored["severity_evidence"]["indicators"], ["insult"])
        self.assertEqual(
            stored["severity_evidence"]["textual_evidence"],
            {"insult": ["stupid"]},
        )
        assessment = main.get_child_risk("child-1", "parent@test.com")
        self.assertEqual(
            assessment["components"]["targeting"]["status"],
            "computed",
        )
        self.assertEqual(
            assessment["components"]["severity"]["status"],
            "computed",
        )
        self.assertEqual(assessment["components"]["severity"]["evidence"], ["insult"])
        self.assertEqual(assessment["multimodal_evidence"]["text"], "available")
        self.assertEqual(assessment["multimodal_evidence"]["image"], "not_provided")
        self.assertEqual(assessment["multimodal_evidence"]["audio"], "not_provided")
        self.assertEqual(assessment["multimodal_evidence"]["video"], "not_provided")
        self.assertIsInstance(assessment["crs"], int)
        self.assertIsInstance(assessment["components"]["historical"]["value"], float)
        self.assertEqual(stored["multimodalAnalysis"]["processingStatus"], "not_required")

    def test_text_image_and_audio_incidents_do_not_fabricate_missing_score_components(self):
        incident_weights = {
            "classifier": 1,
            "targeting": 1,
            "severity": 1,
            "multimodal": 1,
        }
        for content_type in ("text", "image", "audio"):
            with self.subTest(content_type=content_type):
                incident_id = f"score-{content_type}-test"
                incident = main.IncidentCreate(
                    incidentId=incident_id,
                    parentEmail="parent@test.com",
                    childId="child-1",
                    childName="Aarav",
                    type="OUTGOING",
                    messageSnippet="Please stop",
                    riskScore=0.7,
                    riskLevel="high_risk",
                    category="ignored-client-category",
                    packageName="test",
                    timestamp=1_791_138_000_000,
                    childUsername="aarav",
                    severityIndicators=["threat"],
                    contentType=content_type,
                )
                with (
                    patch("main.predict_text", return_value=self._bullying_prediction()),
                    patch(
                        "main.configured_weights",
                        side_effect=lambda prefix, features: (
                            incident_weights if prefix == "incident" else None
                        ),
                    ),
                ):
                    main.create_incident(incident)

                stored = main._incidents[incident_id]
                self.assertEqual(stored["contentType"], content_type)
                self.assertEqual(stored["incident_score_components"]["classifier"], 0.9)
                self.assertIsNone(stored["incident_score"])
                self.assertEqual(
                    stored["incident_score_status"],
                    "insufficient_component_evidence",
                )
                self.assertNotIn("targeting", stored["incident_score_missing_components"])
                self.assertNotIn("severity", stored["incident_score_missing_components"])
                self.assertIn("multimodal", stored["incident_score_missing_components"])

    def test_child_risk_fuses_observed_incidents_deterministically(self):
        incident = main.IncidentCreate(
            incidentId="research-test-incident-2",
            parentEmail="parent@test.com",
            childId="child-1",
            childName="Aarav",
            type="OUTGOING",
            messageSnippet="@aarav, stop",
            riskScore=0.7,
            riskLevel="high_risk",
            category="harassment",
            packageName="test",
            timestamp=1_791_138_000_000,
            senderId="sender-1",
            childUsername="aarav",
            replyToChild=True,
            severityIndicators=["threat"],
        )
        with patch("main.predict_text", return_value=self._bullying_prediction()):
            main.create_incident(incident)

        assessment = main.get_child_risk("child-1", "parent@test.com")

        self.assertEqual(assessment["incident_count"], 1)
        self.assertIsInstance(assessment["crs"], int)
        self.assertIn(assessment["risk_state"], {"SAFE", "WARNING", "HIGH", "CRITICAL"})
        self.assertEqual(assessment["social_graph"]["attacker_count"], 1)
        self.assertEqual(assessment["targeting_evidence_count"], 3)
        self.assertEqual(assessment["severity_evidence_count"], 1)
        self.assertEqual(
            assessment["components"]["targeting"]["status"],
            "computed",
        )
        self.assertEqual(
            assessment["components"]["severity"]["status"],
            "computed",
        )
        self.assertEqual(
            assessment["risk_method"],
            "research_derived_deterministic",
        )
        self.assertTrue(assessment["deterministic_contributions"])

    def test_research_routes_share_canonical_incidents_for_legacy_child_names(self):
        email = "canonical-parent@example.com"
        self.store.create_account(email, "password123", "Parent")
        profile = self.store.add_child_profile(email, "Aarav")
        now = datetime.now(timezone.utc)
        for index in range(9):
            day_offset = 0 if index < 4 else 1
            incident = {
                "incidentId": f"legacy-child-incident-{index}",
                "parentEmail": email,
                "childId": "Aarav",
                "childName": "Aarav",
                "timestamp": int((now - timedelta(days=day_offset)).timestamp() * 1000),
                "riskLevel": "high_risk",
                "riskScore": 0.91,
                "category": "Insult",
                "senderId": f"sender-{index % 3}",
                "status": "PENDING_PARENT_REVIEW",
                "classifierOutput": {"output": {"label": "Bullying"}},
                "targeting_evidence": {
                    "supporting_evidence": ["second_person_reference"],
                    "score": None,
                },
                "severity_evidence": {
                    "indicators": ["insult"],
                    "score": None,
                },
            }
            main._save_incident(incident)

        by_profile_id = main.get_child_risk(profile["child_id"], email)
        timeline = main.get_child_timeline(profile["child_id"], email)
        analytics = main.get_analytics(parentEmail=email, childId=profile["child_id"])
        events = main.get_events(parentEmail=email, childId=profile["child_id"])
        social = main.get_child_social_graph(profile["child_id"], email)

        expected_ids = {f"legacy-child-incident-{index}" for index in range(9)}
        self.assertEqual(by_profile_id["incident_count"], 9)
        self.assertEqual(
            by_profile_id["history_metrics"]["total_incidents"],
            by_profile_id["components"]["historical"]["observed_incident_count"],
        )
        self.assertEqual(
            by_profile_id["components"]["temporal"]["observed_incident_count"],
            9,
        )
        self.assertEqual(
            {entry["incident_id"] for entry in timeline["timeline"]},
            expected_ids,
        )
        self.assertEqual(analytics["total_incidents"], 9)
        self.assertEqual(events["total_events"], 9)
        self.assertEqual(by_profile_id["history_metrics"]["active_days"], 2)
        self.assertEqual(
            by_profile_id["history_metrics"]["average_incidents_per_active_day"],
            4.5,
        )
        self.assertEqual(social["interaction_count"], 9)
        self.assertEqual(
            {entry["classification"] for entry in timeline["timeline"]},
            {"Bullying"},
        )
        self.assertEqual(
            {entry["category"] for entry in timeline["timeline"]},
            {"Insult"},
        )
        self.assertTrue(all(
            entry["classifier_probability"] is None
            for entry in timeline["timeline"]
        ))
        self.assertTrue(all(isinstance(entry["crs"], int) for entry in timeline["timeline"]))

    def test_child_risk_dashboard_computes_descriptive_history_from_real_incidents(self):
        now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
        incident = main.IncidentCreate(
            incidentId="research-history-test",
            parentEmail="parent@test.com",
            childId="child-1",
            childName="Aarav",
            type="INCOMING",
            messageSnippet="@Aarav, please stop",
            riskScore=0.9,
            riskLevel="high_risk",
            category="potential_cyberbullying",
            packageName="test",
            timestamp=now_ms,
            senderId="observed-sender-1",
            childUsername="aarav",
        )
        with patch("main.predict_text", return_value=self._bullying_prediction()):
            main.create_incident(incident)

        with patch.dict(
            "os.environ",
            {
                "CHILDSAFELENS_TEMPORAL_DECAY_PER_SECOND": "0.0001",
                "CHILDSAFELENS_ESCALATION_ALPHA": "0.5",
            },
        ):
            assessment = main.get_child_risk("child-1", "parent@test.com")

        self.assertEqual(assessment["targeting_evidence_count"], 2)
        self.assertEqual(assessment["targeting_incident_count"], 1)
        self.assertEqual(assessment["history_metrics"]["dated_incident_count"], 1)
        self.assertEqual(assessment["history_metrics"]["incidents_last_7_days"], 1)
        self.assertEqual(assessment["history_metrics"]["active_days_last_7_days"], 1)
        self.assertEqual(
            assessment["history_metrics"]["average_incidents_per_active_day"],
            1,
        )
        self.assertEqual(assessment["history_metrics"]["active_days"], 1)
        self.assertEqual(assessment["targeting_cues_per_incident"], 2)
        self.assertEqual(
            assessment["components"]["temporal"]["status"],
            "computed",
        )
        self.assertEqual(
            assessment["components"]["escalation"]["status"],
            "computed",
        )
        self.assertEqual(
            assessment["components"]["historical"]["observed_incident_count"],
            1,
        )
        self.assertIsInstance(assessment["components"]["temporal"]["value"], float)
        self.assertIsInstance(assessment["components"]["historical"]["value"], float)
        self.assertIsInstance(assessment["crs"], int)

    def test_child_risk_temporal_and_escalation_use_stored_incident_history(self):
        now = datetime(2026, 10, 4, tzinfo=timezone.utc)
        records = [
            {
                "incidentId": "history-first",
                "timestamp": (now.timestamp() - 7200) * 1000,
                "incident_score": 0.2,
                "targeting_score": 0.5,
                "severity_evidence": {"score": 0.2},
            },
            {
                "incidentId": "history-second",
                "timestamp": (now.timestamp() - 3600) * 1000,
                "incident_score": 0.5,
                "targeting_score": 0.8,
                "severity_evidence": {"score": 0.8},
            },
        ]
        with patch.dict(
            "os.environ",
            {
                "CHILDSAFELENS_TEMPORAL_DECAY_PER_SECOND": "0.0001925408834888737",
                "CHILDSAFELENS_ESCALATION_ALPHA": "0.5",
            },
        ):
            recent = main.child_risk_assessment(records, "child-1", now)
            after_activity_stops = main.child_risk_assessment(
                records,
                "child-1",
                now + timedelta(days=1),
            )

        temporal = recent["components"]["temporal"]
        escalation = recent["components"]["escalation"]
        self.assertEqual(temporal["status"], "computed")
        self.assertEqual(escalation["status"], "computed")
        self.assertAlmostEqual(escalation["value"], 0.3)
        self.assertGreater(
            temporal["value"],
            after_activity_stops["components"]["temporal"]["value"],
        )

    def test_child_risk_reports_no_history_without_inventing_scores(self):
        assessment = main.child_risk_assessment(
            [],
            "child-without-history",
            datetime(2026, 10, 4, tzinfo=timezone.utc),
        )

        self.assertEqual(assessment["components"]["temporal"]["status"], "no_history")
        self.assertEqual(assessment["components"]["escalation"]["status"], "no_history")
        self.assertIsNone(assessment["components"]["temporal"]["value"])
        self.assertIsNone(assessment["components"]["escalation"]["value"])

    def test_classifier_probability_requires_the_actual_cascade_output(self):
        from research_risk import stored_classifier_probability

        probability = 0.9533061385154724
        incident = {
            "classification": "CYBERBULLYING",
            "modelVersion": "cyberbullying-cascade-v4",
            "riskScore": 0.99,
            "classifierOutput": {
                "modelVersion": "cyberbullying-cascade-v4",
                "output": {"label": "Bullying", "probability": probability},
            },
        }

        self.assertEqual(stored_classifier_probability(incident), probability)
        self.assertIsNone(stored_classifier_probability({
            "classification": "CYBERBULLYING",
            "modelVersion": "cyberbullying-cascade-v4",
            "riskScore": probability,
        }))

    def test_child_state_updates_across_stored_incidents_and_decays_after_activity_stops(self):
        first_time = datetime(2026, 10, 3, tzinfo=timezone.utc)
        second_time = first_time + timedelta(hours=1)
        records = [
            {
                "incidentId": "state-first",
                "parentEmail": "state-parent@example.com",
                "childId": "state-child",
                "childName": "Child",
                "classification": "CYBERBULLYING",
                "timestamp": first_time.timestamp() * 1000,
                "riskScore": 0.9,
                "incident_score": 0.9,
                "targeting_score": 0.9,
                "targeting_evidence": {"score": 0.9},
                "severity_evidence": {"score": 0.3},
            },
            {
                "incidentId": "state-second",
                "parentEmail": "state-parent@example.com",
                "childId": "state-child",
                "childName": "Child",
                "classification": "CYBERBULLYING",
                "timestamp": second_time.timestamp() * 1000,
                "riskScore": 0.9,
                "incident_score": 0.9,
                "targeting_score": 0.9,
                "targeting_evidence": {"score": 0.9},
                "severity_evidence": {"score": 0.8},
            },
        ]
        for record in records:
            main._incidents[record["incidentId"]] = record

        with patch.dict(
            "os.environ",
            {
                "CHILDSAFELENS_TEMPORAL_DECAY_PER_SECOND": "0.0005",
                "CHILDSAFELENS_ESCALATION_ALPHA": "0.5",
                "CHILDSAFELENS_HISTORICAL_RETENTION": "0.5",
            },
        ):
            stored = main._child_incidents(
                "state-parent@example.com",
                child_id="state-child",
            )
            first = main.child_risk_assessment(
                stored[:1],
                "state-child",
                first_time,
            )
            recent = main.child_risk_assessment(stored, "state-child", second_time)
            stopped = main.child_risk_assessment(
                stored,
                "state-child",
                second_time + timedelta(days=2),
            )

        self.assertEqual(first["components"]["historical"]["status"], "computed")
        self.assertEqual(first["components"]["historical"]["observed_incident_count"], 1)
        self.assertIsInstance(first["components"]["historical"]["value"], float)
        self.assertEqual(
            recent["components"]["historical"]["status"],
            "computed",
        )
        self.assertEqual(recent["components"]["historical"]["observed_incident_count"], 2)
        self.assertIsInstance(recent["components"]["historical"]["value"], float)
        self.assertIsInstance(recent["crs"], int)
        self.assertIsInstance(stopped["crs"], int)
        self.assertIn(recent["risk_state"], {"SAFE", "WARNING", "HIGH", "CRITICAL"})
        self.assertEqual(
            recent["risk_fusion"]["status"],
            "training_target_unavailable",
        )
        self.assertEqual(
            recent["risk_fusion"]["message"],
            "XGBoost requires a research-defined training target.",
        )
        self.assertEqual(
            recent["risk_fusion"]["explanation"]["message"],
            "Explanation unavailable",
        )
        self.assertEqual(
            recent["research_state"]["component_order"],
            ["P", "D", "S", "M", "T", "E", "G", "H"],
        )
        state = recent["research_state"]["components"]
        self.assertIsNone(state["P"]["value"])
        self.assertEqual(state["D"]["value"], 0.9)
        self.assertEqual(state["S"]["value"], 0.8)
        self.assertIsNone(state["M"]["value"])
        self.assertEqual(state["T"]["value"], recent["components"]["temporal"]["value"])
        self.assertEqual(state["E"]["value"], recent["components"]["escalation"]["value"])
        self.assertIsNone(state["G"]["value"])
        self.assertEqual(state["H"]["value"], recent["components"]["historical"]["value"])

    def test_xgboost_output_is_the_only_source_of_crs(self):
        from risk_fusion import RiskFusionService

        service = RiskFusionService(
            lambda _: 0.76,
            model_version="xgboost:test",
            status="model_loaded",
            target_id="approved-child-risk-target",
            explainer=lambda _: {
                "model_output": "raw_margin",
                "base_value": 0.5,
                "feature_contributions": [
                    {"feature": "incident_score", "value": 0.1},
                    {"feature": "temporal_risk", "value": 0.0},
                    {"feature": "escalation", "value": 0.0},
                    {"feature": "social_graph", "value": 0.0},
                    {"feature": "historical", "value": 0.1},
                ],
                "explained_output": 0.7,
                "reconstructed_output": 0.7,
                "additivity_verified": True,
            },
            explanation_status="available",
        )
        records = [
            {
                "incidentId": "fusion-previous-incident",
                "timestamp": (
                    datetime(2026, 10, 3, tzinfo=timezone.utc).timestamp()
                ),
                "incident_score": 0.2,
                "targeting_score": 0.5,
                "severity_evidence": {"score": 0.2},
                "senderId": "sender-1",
                "childId": "child-1",
            },
            {
                "incidentId": "fusion-current-incident",
                "timestamp": datetime(2026, 10, 4, tzinfo=timezone.utc).timestamp(),
                "incident_score": 0.6,
                "targeting_score": 0.7,
                "severity_evidence": {"score": 0.5},
                "senderId": "sender-1",
                "childId": "child-1",
            }
        ]
        with (
            patch("research_risk.risk_fusion_service", service),
            patch.dict(
                "os.environ",
                {
                    "CHILDSAFELENS_TEMPORAL_DECAY_PER_SECOND": "0.0001",
                    "CHILDSAFELENS_ESCALATION_ALPHA": "0.5",
                    "CHILDSAFELENS_HISTORICAL_RETENTION": "0.5",
                    "CHILDSAFELENS_GRAPH_ATTACKERS_WEIGHT": "1",
                    "CHILDSAFELENS_GRAPH_CONCENTRATION_WEIGHT": "1",
                    "CHILDSAFELENS_GRAPH_FREQUENCY_WEIGHT": "1",
                },
            ),
        ):
            assessment = main.child_risk_assessment(
                records,
                "child-1",
                datetime(2026, 10, 4, tzinfo=timezone.utc),
            )

        self.assertEqual(assessment["crs"], 76.0)
        self.assertEqual(assessment["risk_state"], "CRITICAL")
        self.assertEqual(assessment["status"], "computed_model")
        self.assertEqual(
            assessment["risk_fusion"]["feature_order"],
            [
                "incident_score",
                "temporal_risk",
                "escalation",
                "social_graph",
                "historical",
            ],
        )
        self.assertEqual(assessment["risk_fusion"]["model_version"], "xgboost:test")
        self.assertEqual(
            assessment["risk_fusion"]["explanation"]["status"],
            "computed",
        )
        self.assertTrue(
            assessment["risk_fusion"]["explanation"]["additivity_verified"]
        )

    def test_social_graph_route_uses_only_stored_incidents_and_configured_weights(self):
        incidents = (
            ("graph-one", "sender-a"),
            ("graph-two", "sender-a"),
            ("graph-three", "sender-b"),
        )
        for incident_id, sender_id in incidents:
            incident = main.IncidentCreate(
                incidentId=incident_id,
                parentEmail="graph-parent@example.com",
                childId="graph-child",
                childName="Child",
                type="INCOMING",
                messageSnippet="you are stupid",
                riskScore=0.0,
                riskLevel="low_risk",
                category="untrusted-category",
                packageName="test",
                timestamp=1_791_138_000_000,
                senderId=sender_id,
            )
            with patch("main.predict_text", return_value=self._bullying_prediction()):
                main.create_incident(incident)

        with patch.dict(
            "os.environ",
            {
                "CHILDSAFELENS_GRAPH_ATTACKERS_WEIGHT": "1",
                "CHILDSAFELENS_GRAPH_CONCENTRATION_WEIGHT": "1",
                "CHILDSAFELENS_GRAPH_FREQUENCY_WEIGHT": "1",
            },
        ):
            graph = main.get_child_social_graph(
                "graph-child",
                "graph-parent@example.com",
            )

        self.assertEqual(graph["status"], "available")
        self.assertEqual(graph["attacker_count"], 2)
        self.assertEqual(graph["interaction_count"], 3)
        self.assertEqual(graph["features"]["concentration"]["value"], 2 / 3)
        self.assertEqual(graph["graph_score_status"], "computed_development_metric")
        self.assertAlmostEqual(
            graph["graph_score"],
            ((2 / 7) + (2 / 3) + (3 / 7)) / 3,
        )

    def test_social_graph_route_returns_no_history_for_child_without_incidents(self):
        graph = main.get_child_social_graph(
            "child-without-social-history",
            "parent-without-social-history@example.com",
        )

        self.assertEqual(graph["status"], "no_history")
        self.assertEqual(graph["interaction_count"], 0)
        self.assertEqual(graph["edges"], [])
        self.assertIsNone(graph["graph_score"])

    def test_parent_action_does_not_change_deterministic_research_risk(self):
        incident = main.IncidentCreate(
            incidentId="research-parent-action-test",
            parentEmail="parent@test.com",
            childId="child-1",
            childName="Aarav",
            type="OUTGOING",
            messageSnippet="message",
            riskScore=0.3,
            riskLevel="medium_risk",
            category="test",
            packageName="test",
            timestamp=1_791_138_000_000,
        )
        with patch("main.predict_text", return_value=self._bullying_prediction()):
            main.create_incident(incident)
        before_decision = main.get_child_risk("child-1", "parent@test.com")
        main.parent_allow(incident.incidentId)

        assessment = main.get_child_risk("child-1", "parent@test.com")
        explanation = main.get_incident_explanation(
            incident.incidentId, "parent@test.com"
        )

        self.assertEqual(assessment["crs"], before_decision["crs"])
        self.assertEqual(assessment["risk_state"], before_decision["risk_state"])
        self.assertEqual(main._incidents[incident.incidentId]["parentDecision"], "ALLOW")
        self.assertEqual(explanation["parent_action"], "ALLOW")
        self.assertIsNone(explanation["shap_values"])

    @staticmethod
    def _bullying_prediction():
        return {
            "classification_label": "Bullying",
            "classification": "CYBERBULLYING",
            "cyberbullying": True,
            "model_status": "real",
            "model_version": "cyberbullying-cascade-v4",
            "risk_score": 0.9,
            "p_bullying": 0.9,
            "gate_threshold": 0.5400000000000001,
            "category": "Insult",
            "categories": [{"name": "Insult", "prob": 0.88}],
            "label": "high_risk",
        }

    def test_clean_message_submitted_as_pending_is_rejected(self):
        incident = main.IncidentCreate(
            incidentId="clean-message-test",
            parentEmail="parent@test.com",
            childId="child-1",
            childName="Aarav",
            type="OUTGOING",
            messageSnippet="Hello, how are you?",
            riskScore=0.99,
            riskLevel="high_risk",
            category="potential_cyberbullying",
            packageName="test",
            timestamp=1_791_138_000_000,
            status="PENDING_PARENT_REVIEW",
        )
        with patch(
            "main.predict_text",
            return_value={
                "classification_label": "Clean",
                "model_status": "real",
                "model_version": "cyberbullying-cascade-v4",
                "risk_score": 0.02,
                "label": "low_risk",
            },
        ) as classify:
            with self.assertRaises(main.HTTPException) as error:
                main.create_incident(incident)

        self.assertEqual(error.exception.status_code, 422)
        self.assertEqual(classify.call_args.args[0], "Hello, how are you?")
        self.assertNotIn(incident.incidentId, main._incidents)
        self.assertIsNone(self.store.get_incident(incident.incidentId))
        main._incidents["legacy-clean"] = {
            "incidentId": "legacy-clean",
            "parentEmail": "parent@test.com",
            "childId": "child-1",
            "childName": "Aarav",
            "classification": "CLEAN",
            "timestamp": 1_791_138_000_000,
        }
        self.assertEqual(
            main._child_incidents("parent@test.com", child_id="child-1"),
            [],
        )

    def test_incident_verification_uses_full_message_text_when_provided(self):
        incident = main.IncidentCreate(
            incidentId="full-message-test",
            parentEmail="parent@test.com",
            childId="child-1",
            childName="Aarav",
            type="OUTGOING",
            messageSnippet="You are stupid and",
            messageText="You are stupid and nobody likes you",
            riskScore=0.01,
            riskLevel="low_risk",
            category="potential_cyberbullying",
            packageName="test",
            timestamp=1_791_138_000_000,
            status="ALLOWED",
        )
        with patch(
            "main.predict_text", return_value=self._bullying_prediction()
        ) as classify:
            response = main.create_incident(incident)

        self.assertEqual(classify.call_args.args[0], incident.messageText)
        self.assertEqual(response["status"], "ok")
        self.assertEqual(main._incidents[incident.incidentId]["riskScore"], 0.9)
        self.assertEqual(main._incidents[incident.incidentId]["riskLevel"], "high_risk")
        self.assertEqual(
            main._incidents[incident.incidentId]["status"],
            "PENDING_PARENT_REVIEW",
        )
        self.assertEqual(
            main._incidents[incident.incidentId]["messageSnippet"],
            incident.messageSnippet,
        )

    def test_incident_verification_fails_closed_when_real_model_is_unavailable(self):
        incident = main.IncidentCreate(
            incidentId="unverified-message-test",
            parentEmail="parent@test.com",
            childId="child-1",
            childName="Aarav",
            type="OUTGOING",
            messageSnippet="stupid",
            riskScore=0.99,
            riskLevel="high_risk",
            category="potential_cyberbullying",
            packageName="test",
            timestamp=1_791_138_000_000,
        )
        with patch(
            "main.predict_text",
            return_value={
                "classification_label": "Bullying",
                "model_status": "dummy",
                "model_version": "dummy-dev",
                "risk_score": 0.9,
                "label": "high_risk",
            },
        ):
            with self.assertRaises(main.HTTPException) as error:
                main.create_incident(incident)

        self.assertEqual(error.exception.status_code, 503)
        self.assertNotIn(incident.incidentId, main._incidents)

    def test_incident_verification_rejects_a_different_real_model(self):
        incident = main.IncidentCreate(
            incidentId="wrong-model-message-test",
            parentEmail="parent@test.com",
            childId="child-1",
            childName="Aarav",
            type="OUTGOING",
            messageSnippet="stupid",
            riskScore=0.99,
            riskLevel="high_risk",
            category="potential_cyberbullying",
            packageName="test",
            timestamp=1_791_138_000_000,
        )
        with patch(
            "main.predict_text",
            return_value={
                "classification_label": "Bullying",
                "model_status": "real",
                "model_version": "another-model",
                "risk_score": 0.9,
                "label": "high_risk",
            },
        ):
            with self.assertRaises(main.HTTPException) as error:
                main.create_incident(incident)

        self.assertEqual(error.exception.status_code, 503)
        self.assertNotIn(incident.incidentId, main._incidents)


if __name__ == "__main__":
    unittest.main()
