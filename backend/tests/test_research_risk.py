import math
import os
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from research_risk import (
    SEVERITY_CATEGORIES,
    analytics_summary,
    configured_weights,
    current_incident_score,
    escalation_score,
    historical_risk,
    _historical_component,
    risk_state,
    severity_evidence,
    social_graph,
    targeting_evidence,
    temporal_risk,
    weighted_score,
)


class ResearchRiskTests(unittest.TestCase):
    def test_targeting_reports_observed_cues_without_inventing_probability(self):
        result = targeting_evidence(
            "@Aarav, please stop",
            child_name="Aarav",
            child_username="aarav",
            reply_to_child=True,
        )

        self.assertEqual(result["status"], "observed")
        self.assertIsNone(result["score"])
        self.assertEqual(
            result["supporting_evidence"],
            ["direct_mention", "child_name_reference", "reply_to_child"],
        )

    def test_text_only_targeting_runs_but_does_not_overstate_child_targeting(self):
        result = targeting_evidence("You are so stupid")

        self.assertEqual(result["status"], "observed")
        self.assertEqual(result["analysis_status"], "completed")
        self.assertIn("second_person_reference", result["available_signals"])
        self.assertEqual(result["supporting_evidence"], ["second_person_reference"])
        self.assertIsNone(result["score"])

    def test_targeting_score_normalizes_only_available_configured_signals(self):
        result = targeting_evidence(
            "@aarav, I will hurt you",
            child_username="aarav",
            reply_to_child=True,
            personal_reference=False,
            weights={
                "direct_mention": 2,
                "reply_to_child": 1,
                "personal_reference": 2,
                "second_person_reference": 3,
            },
        )

        self.assertEqual(result["status"], "computed")
        self.assertEqual(
            result["available_signals"],
            [
                "direct_mention",
                "reply_to_child",
                "personal_reference",
                "second_person_reference",
            ],
        )
        self.assertAlmostEqual(result["score"], 6 / 8)

    def test_severity_evidence_does_not_assign_uncalibrated_scores(self):
        result = severity_evidence(["threat", "threat", "unrecognized"])

        self.assertEqual(result["indicators"], ["threat"])
        self.assertIsNone(result["score"])

    def test_text_only_severity_uses_actual_textual_cues_without_other_modalities(self):
        insult = severity_evidence([], text="You are so stupid")
        threat = severity_evidence([], text="I will hurt you")

        self.assertEqual(insult["analysis_status"], "completed")
        self.assertEqual(insult["status"], "available")
        self.assertEqual(insult["indicators"], ["insult"])
        self.assertEqual(insult["textual_evidence"], {"insult": ["stupid"]})
        self.assertIsNone(insult["score"])
        self.assertEqual(threat["indicators"], ["physical_harm", "threat"])
        self.assertEqual(
            threat["textual_evidence"],
            {"threat": ["i will hurt you"], "physical_harm": ["hurt you"]},
        )

    def test_text_without_severity_cues_is_analyzed_but_remains_insufficient(self):
        result = severity_evidence([], text="I hope your day goes well")

        self.assertEqual(result["analysis_status"], "completed")
        self.assertEqual(result["status"], "insufficient_evidence")
        self.assertEqual(result["indicators"], [])
        self.assertIsNone(result["score"])

    def test_severity_score_requires_explicit_evidence_and_configured_weights(self):
        env = {
            f"CHILDSAFELENS_SEVERITY_{category.upper()}_WEIGHT": "1"
            for category in SEVERITY_CATEGORIES
        }
        with patch.dict(os.environ, env, clear=False):
            weights = configured_weights("severity", SEVERITY_CATEGORIES)
            result = severity_evidence(["threat"], weights, evidence_provided=True)

        self.assertEqual(result["score"], 1 / len(SEVERITY_CATEGORIES))
        self.assertEqual(result["score_status"], "configured_uncalibrated_weights")

    def test_weighted_score_requires_configured_weights_and_complete_signals(self):
        self.assertIsNone(weighted_score({"classifier": 0.8}, None))
        self.assertIsNone(weighted_score({"classifier": None}, {"classifier": 1}))
        self.assertAlmostEqual(
            weighted_score(
                {"classifier": 0.8, "targeting": 0.4},
                {"classifier": 1, "targeting": 1},
            ),
            0.6,
        )

    def test_current_incident_score_combines_complete_observed_signals(self):
        result = current_incident_score(
            classifier_probability=0.8,
            targeting_score=0.6,
            severity_score=0.4,
            multimodal_score=0.2,
            weights={
                "classifier": 4,
                "targeting": 3,
                "severity": 2,
                "multimodal": 1,
            },
        )

        self.assertEqual(result["status"], "computed")
        self.assertAlmostEqual(result["score"], 0.6)
        self.assertEqual(result["missing_components"], [])
        self.assertEqual(result["weight_status"], "configured_development_parameters")

    def test_current_incident_score_does_not_infer_missing_classifier_probability(self):
        result = current_incident_score(
            classifier_probability=None,
            targeting_score=0.6,
            severity_score=0.4,
            multimodal_score=0.2,
            weights={
                "classifier": 1,
                "targeting": 1,
                "severity": 1,
                "multimodal": 1,
            },
        )

        self.assertIsNone(result["score"])
        self.assertEqual(result["status"], "insufficient_component_evidence")
        self.assertEqual(result["missing_components"], ["classifier"])

    def test_current_incident_score_requires_configured_weights(self):
        result = current_incident_score(0.8, 0.6, 0.4, 0.2, None)

        self.assertIsNone(result["score"])
        self.assertEqual(result["status"], "weights_not_configured")

    def test_temporal_risk_uses_stored_scores_and_decay(self):
        now = datetime(2026, 10, 4, tzinfo=timezone.utc)
        history = [
            {
                "timestamp": (now.timestamp() - 3600) * 1000,
                "incident_score": 0.5,
                "targeting_score": 0.8,
            }
        ]

        actual = temporal_risk(history, now, decay_per_second=math.log(2) / 3600)
        expected = 1 - math.exp(-(0.5 * 0.8 * 0.5))
        self.assertAlmostEqual(actual, expected)
        self.assertIsNone(temporal_risk([], now, decay_per_second=0.1))

    def test_first_incident_uses_only_that_actual_incident_and_has_no_escalation_history(self):
        now = datetime(2026, 10, 4, tzinfo=timezone.utc)
        first_incident = {
            "timestamp": now.timestamp(),
            "incident_score": 0.5,
            "targeting_score": 0.8,
        }

        temporal = temporal_risk([first_incident], now, decay_per_second=0.1)

        self.assertAlmostEqual(temporal, 1 - math.exp(-0.4))
        self.assertIsNone(escalation_score(0.7, [], alpha=0.5))

    def test_repeated_recent_incidents_raise_temporal_risk(self):
        now = datetime(2026, 10, 4, tzinfo=timezone.utc)
        incident = {
            "timestamp": now.timestamp(),
            "incident_score": 0.4,
            "targeting_score": 0.5,
        }

        single_risk = temporal_risk([incident], now, decay_per_second=0.01)
        repeated_risk = temporal_risk([incident, incident], now, decay_per_second=0.01)

        self.assertGreater(repeated_risk, single_risk)

    def test_old_incidents_decay_and_risk_decreases_when_activity_stops(self):
        now = datetime(2026, 10, 4, tzinfo=timezone.utc)
        incident = {
            "timestamp": now.timestamp(),
            "incident_score": 0.6,
            "targeting_score": 0.7,
        }
        decay = math.log(2) / 3600

        recent_risk = temporal_risk([incident], now, decay)
        one_hour_later_risk = temporal_risk(
            [incident], now + timedelta(hours=1), decay
        )
        old_incident = {**incident, "timestamp": now.timestamp() - 3600}
        old_risk = temporal_risk([old_incident], now, decay)

        self.assertGreater(recent_risk, one_hour_later_risk)
        self.assertAlmostEqual(old_risk, one_hour_later_risk)

    def test_temporal_risk_is_unavailable_if_a_stored_score_is_missing(self):
        history = [{"timestamp": 1_791_138_000_000, "incident_score": 0.4}]

        self.assertIsNone(
            temporal_risk(
                history,
                datetime(2026, 10, 4, tzinfo=timezone.utc),
                decay_per_second=0.1,
            )
        )

    def test_escalation_tracks_increasing_and_non_increasing_severity(self):
        self.assertAlmostEqual(escalation_score(0.8, [0.2, 0.4], alpha=0.5), 0.5)
        self.assertEqual(escalation_score(0.3, [0.4, 0.6], alpha=0.5), 0.0)
        self.assertIsNone(escalation_score(0.3, [], alpha=0.5))
        self.assertIsNone(escalation_score(None, [0.2], alpha=0.5))

    def test_historical_risk_uses_current_risk_and_previous_state(self):
        self.assertAlmostEqual(historical_risk(0.5, [0.4], retention=0.8), 0.42)
        self.assertEqual(historical_risk(0.5, [], retention=0.8), 0.5)
        self.assertIsNone(historical_risk(None, [0.4], retention=0.8))
        self.assertLess(historical_risk(0.1, [0.8], retention=0.8), 0.8)

    def test_historical_retention_must_not_lock_state_permanently(self):
        with patch.dict(os.environ, {"CHILDSAFELENS_HISTORICAL_RETENTION": "1"}):
            with self.assertRaisesRegex(ValueError, "must be less than 1"):
                _historical_component(
                    [{"timestamp": 1_791_138_000_000}],
                    {"value": 0.2, "lambda_per_second": 0.001},
                )

    def test_risk_state_has_explicit_boundaries_and_unknown_state(self):
        self.assertEqual(risk_state(None), "Not available")
        self.assertEqual(risk_state(24.9), "SAFE")
        self.assertEqual(risk_state(25), "WARNING")
        self.assertEqual(risk_state(50), "HIGH")
        self.assertEqual(risk_state(75), "CRITICAL")

    def test_social_graph_uses_only_actual_sender_ids(self):
        incidents = [
            {"incidentId": "one", "senderId": "sender-a", "childId": "child-1"},
            {"incidentId": "two", "senderId": "sender-a", "childId": "child-1"},
            {"incidentId": "three", "senderId": "sender-b", "childId": "child-1"},
        ]

        graph = social_graph(incidents, "child-1")

        self.assertEqual(graph["attacker_count"], 2)
        self.assertEqual(graph["repeated_attacker_count"], 1)
        self.assertEqual(graph["interaction_count"], 3)
        self.assertEqual(graph["incident_concentration"], 2 / 3)
        self.assertEqual(graph["features"]["attackers"]["value"], 2)
        self.assertEqual(graph["features"]["frequency"]["value"], 3)
        self.assertEqual(graph["features"]["concentration"]["value"], 2 / 3)
        self.assertNotIn("sender-a", str(graph["nodes"]))

    def test_social_graph_counts_one_actual_sender_once(self):
        graph = social_graph(
            [{"incidentId": "one", "senderId": "sender-a", "childId": "child-1"}],
            "child-1",
        )

        self.assertEqual(graph["attacker_count"], 1)
        self.assertEqual(graph["interaction_count"], 1)
        self.assertEqual(graph["incident_concentration"], 1)
        self.assertEqual(graph["features"]["attackers"]["value"], 1)
        self.assertEqual(graph["features"]["frequency"]["value"], 1)

    def test_social_graph_score_uses_explicit_weights_and_real_features(self):
        incidents = [
            {"incidentId": "one", "senderId": "sender-a", "childId": "child-1"},
            {"incidentId": "two", "senderId": "sender-a", "childId": "child-1"},
            {"incidentId": "three", "senderId": "sender-b", "childId": "child-1"},
        ]
        graph = social_graph(
            incidents,
            "child-1",
            weights={"attackers": 1, "concentration": 1, "frequency": 1},
        )

        self.assertAlmostEqual(graph["graph_score"], (2 + (2 / 3) + 3) / 3)
        self.assertEqual(graph["graph_score_status"], "computed_development_metric")
        self.assertEqual(
            graph["graph_score_weight_status"],
            "configured_development_parameters",
        )

    def test_social_graph_does_not_assume_missing_sender_ids(self):
        graph = social_graph(
            [{"incidentId": "one", "childId": "child-1"}], "child-1"
        )

        self.assertEqual(graph["status"], "insufficient_interaction_data")
        self.assertIsNone(graph["attacker_count"])
        self.assertEqual(graph["observed_attacker_count"], 0)
        self.assertEqual(graph["interaction_count"], 0)

    def test_social_graph_reports_no_history_without_creating_interactions(self):
        graph = social_graph([], "child-1")

        self.assertEqual(graph["status"], "no_history")
        self.assertEqual(graph["interaction_count"], 0)
        self.assertIsNone(graph["attacker_count"])
        self.assertEqual(graph["observed_attacker_count"], 0)
        self.assertIsNone(graph["graph_score"])
        self.assertEqual(graph["graph_score_status"], "no_history")
        self.assertEqual(len(graph["edges"]), 0)
        self.assertEqual(graph["nodes"], [])

    def test_analytics_counts_only_incidents_in_the_supplied_history(self):
        now = datetime(2026, 10, 4, tzinfo=timezone.utc)
        result = analytics_summary([], now)
        self.assertEqual(result["total_incidents"], 0)
        self.assertEqual(result["high_risk"], 0)
        self.assertEqual(len(result["daily_incidents"]), 7)

        result = analytics_summary(
            [
                {
                    "timestamp": int(now.timestamp() * 1000),
                    "riskLevel": "high_risk",
                    "senderId": "sender-a",
                }
            ],
            now,
        )
        self.assertEqual(result["total_incidents"], 1)
        self.assertEqual(result["high_risk"], 1)
        self.assertEqual(result["daily_incidents"][-1]["count"], 1)


if __name__ == "__main__":
    unittest.main()
