import math
import os
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from risk_fusion import (
    EXPLANATION_UNAVAILABLE,
    FEATURE_ORDER,
    TARGET_REQUIRED_MESSAGE,
    TARGET_VALIDATION_ENV,
    RiskFusionService,
)


class RiskFusionServiceTests(unittest.TestCase):
    def setUp(self):
        self.features = {
            "historical": 0.5,
            "social_graph": 0.4,
            "escalation": 0.3,
            "temporal_risk": 0.2,
            "incident_score": 0.1,
        }

    def test_requires_research_defined_target_and_returns_no_fake_score(self):
        with patch.dict(
            "os.environ",
            {
                "CHILDSAFELENS_RISK_TRAINING_TARGET": "",
                TARGET_VALIDATION_ENV: "false",
            },
            clear=False,
        ):
            service = RiskFusionService.from_environment()

        result = service.predict(self.features)

        self.assertIsNone(result["score"])
        self.assertEqual(result["status"], "training_target_unavailable")
        self.assertEqual(result["message"], TARGET_REQUIRED_MESSAGE)
        self.assertFalse(service.status()["model_loaded"])

    def test_model_receives_features_in_declared_order_and_output_is_used_for_crs(self):
        observed_inputs = []
        service = RiskFusionService(
            lambda values: observed_inputs.append(values) or 0.78,
            model_version="xgboost:test",
            status="model_loaded",
            target_id="approved-child-window-state",
        )

        result = service.predict(self.features)

        self.assertEqual(observed_inputs, [[0.1, 0.2, 0.3, 0.4, 0.5]])
        self.assertEqual(result["feature_order"], list(FEATURE_ORDER))
        self.assertEqual(result["score"], 0.78)
        self.assertEqual(result["status"], "computed")
        self.assertEqual(result["model_version"], "xgboost:test")
        self.assertEqual(result["score"] * 100, 78.0)

    def test_model_requires_all_features_and_output_in_unit_interval(self):
        service = RiskFusionService(
            lambda _: 0.5,
            status="model_loaded",
            target_id="target",
        )
        incomplete = dict(self.features)
        incomplete["social_graph"] = None

        result = service.predict(incomplete)

        self.assertIsNone(result["score"])
        self.assertEqual(result["status"], "insufficient_features")
        self.assertEqual(result["missing_features"], ["social_graph"])
        for output in (-0.1, 1.1, math.nan):
            with self.subTest(output=output):
                invalid_service = RiskFusionService(
                    lambda _, prediction=output: prediction,
                    status="model_loaded",
                    target_id="target",
                )
                with self.assertRaisesRegex(ValueError, "output must be between 0 and 1"):
                    invalid_service.predict(self.features)

    def test_environment_loader_does_not_load_artifact_without_target(self):
        with patch.dict(
            "os.environ",
            {
                "CHILDSAFELENS_RISK_TRAINING_TARGET": "candidate-not-reviewed",
                TARGET_VALIDATION_ENV: "false",
                "CHILDSAFELENS_RISK_MODEL": "missing-model.ubj",
            },
            clear=False,
        ):
            service = RiskFusionService.from_environment()

        self.assertEqual(service.status()["status"], "training_target_unavailable")
        self.assertFalse(service.status()["training_target_available"])
        self.assertFalse(service.status()["model_loaded"])

    def test_missing_model_returns_explanation_unavailable(self):
        with patch.dict(
            "os.environ",
            {
                "CHILDSAFELENS_RISK_TRAINING_TARGET": "",
                TARGET_VALIDATION_ENV: "false",
            },
            clear=False,
        ):
            service = RiskFusionService.from_environment()

        explanation = service.explain(self.features)

        self.assertEqual(explanation["status"], "unavailable")
        self.assertEqual(explanation["message"], EXPLANATION_UNAVAILABLE)

    def test_tree_shap_contributions_are_returned_with_additive_model_output(self):
        contributions = [0.1, -0.2, 0.05, 0.3, 0.15]
        service = RiskFusionService(
            lambda _: 0.7,
            model_version="xgboost:test",
            status="model_loaded",
            target_id="approved-child-risk-target",
            explainer=lambda _: {
                "model_output": "raw_margin",
                "base_value": 0.4,
                "feature_contributions": [
                    {"feature": feature, "value": value}
                    for feature, value in zip(FEATURE_ORDER, contributions)
                ],
                "explained_output": 0.8,
                "reconstructed_output": 0.8,
                "additivity_verified": True,
            },
            explanation_status="available",
        )

        explanation = service.explain(self.features)

        self.assertEqual(explanation["status"], "computed")
        self.assertEqual(explanation["model_output"], "raw_margin")
        self.assertEqual(explanation["base_value"], 0.4)
        self.assertEqual(explanation["feature_contributions"][1]["value"], -0.2)
        self.assertAlmostEqual(
            explanation["base_value"]
            + sum(item["value"] for item in explanation["feature_contributions"]),
            explanation["explained_output"],
        )
        self.assertTrue(explanation["additivity_verified"])

    def test_configured_model_and_tree_explainer_share_the_same_booster(self):
        class Prediction(list):
            def tolist(self):
                return list(self)

            def item(self):
                return self[0]

        class Booster:
            feature_names = list(FEATURE_ORDER)

            def load_model(self, _):
                return None

            def attr(self, name):
                return {
                    "childsafelens_target_id": "approved-child-risk-target",
                    "childsafelens_output_scale": "0_1",
                }.get(name)

            def predict(self, _, output_margin=False):
                return Prediction([0.8 if output_margin else 0.7])

        booster = Booster()
        xgboost = SimpleNamespace(
            Booster=lambda: booster,
            DMatrix=lambda rows, feature_names: (rows, feature_names),
            __version__="test",
        )

        class TreeExplainer:
            expected_value = 0.3

            def __init__(self, model):
                if model is not booster:
                    raise AssertionError("Expected the loaded risk-fusion Booster.")

            def shap_values(self, _):
                return [[0.1, 0.1, 0.1, 0.1, 0.1]]

        shap = SimpleNamespace(TreeExplainer=TreeExplainer)
        with tempfile.TemporaryDirectory() as temp_dir:
            artifact = Path(temp_dir) / "risk_model.ubj"
            artifact.touch()
            with (
                patch("risk_fusion.importlib.util.find_spec", return_value=object()),
                patch(
                    "risk_fusion.importlib.import_module",
                    side_effect=lambda name: {
                        "xgboost": xgboost,
                        "shap": shap,
                    }[name],
                ),
                patch.dict(
                    os.environ,
                    {
                        "CHILDSAFELENS_RISK_TRAINING_TARGET":
                            "approved-child-risk-target",
                        TARGET_VALIDATION_ENV: "true",
                        "CHILDSAFELENS_RISK_MODEL": str(artifact),
                    },
                ),
            ):
                service = RiskFusionService.from_environment()

        prediction = service.predict(self.features)
        explanation = service.explain(self.features)

        self.assertEqual(prediction["score"], 0.7)
        self.assertEqual(explanation["status"], "computed")
        self.assertEqual(explanation["model_output"], "raw_margin")
        self.assertEqual(explanation["explained_output"], 0.8)
        self.assertAlmostEqual(
            explanation["base_value"]
            + sum(item["value"] for item in explanation["feature_contributions"]),
            explanation["explained_output"],
        )

    def test_shap_failure_returns_unavailable_without_fabricating_values(self):
        def fail_explanation(_):
            raise RuntimeError("internal explainer failure")

        service = RiskFusionService(
            lambda _: 0.7,
            status="model_loaded",
            target_id="approved-child-risk-target",
            explainer=fail_explanation,
            explanation_status="available",
        )

        explanation = service.explain(self.features)

        self.assertEqual(explanation["status"], "unavailable")
        self.assertEqual(explanation["message"], EXPLANATION_UNAVAILABLE)
        self.assertNotIn("feature_contributions", explanation)


if __name__ == "__main__":
    unittest.main()
