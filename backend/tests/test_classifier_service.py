import unittest
from pathlib import Path
from unittest.mock import patch

from classifier_service import (
    CASCADE_MODEL_VERSION,
    ClassificationResult,
    ClassifierService,
    ModelUnavailableError,
    UnavailableCascadeClassifier,
    classifier,
)
from model import predict_text, score_text


class ClassifierServiceTests(unittest.TestCase):
    def test_supplied_cascade_artifact_runs_clean_and_bullying_predictions(self):
        status = classifier.status()
        self.assertEqual(status["status"], "real")
        self.assertEqual(status["model_version"], CASCADE_MODEL_VERSION)
        self.assertTrue(status["artifact_present"])
        self.assertFalse(status["validated"])

        bullying = classifier.classify("you are an idiot")
        clean = classifier.classify("Have a nice day, see you tomorrow")
        greeting = predict_text("hi")

        self.assertEqual(bullying.label, "Bullying")
        self.assertEqual(bullying.category, "Insult")
        self.assertEqual(bullying.categories[0]["name"], "Insult")
        self.assertEqual(bullying.gate_threshold, 0.5400000000000001)
        self.assertEqual(bullying.model_version, CASCADE_MODEL_VERSION)
        self.assertEqual(clean.label, "Clean")
        self.assertIsNone(clean.category)
        self.assertEqual(greeting["model_classification"], "Bullying")
        self.assertEqual(greeting["classification_label"], "Clean")
        self.assertFalse(greeting["cyberbullying"])
        self.assertEqual(greeting["decision_override"], "standalone_greeting")
        self.assertGreater(greeting["p_bullying"], greeting["gate_threshold"])

    def test_unavailable_cascade_never_substitutes_a_prediction(self):
        unavailable = UnavailableCascadeClassifier(
            FileNotFoundError("missing test artifact"),
            Path("missing-cascade.keras"),
        )

        self.assertEqual(unavailable.status()["status"], "model_not_configured")
        with self.assertRaises(ModelUnavailableError):
            unavailable.classify("you are an idiot")

    def setUp(self):
        class StubClassifier:
            seen_text = None

            def classify(self, text):
                self.seen_text = text
                bullying = text.strip().casefold() in {"you are an idiot", "hi!?"}
                return ClassificationResult(
                    label="Bullying" if bullying else "Clean",
                    probability=0.91 if bullying else 0.04,
                    confidence=None,
                    model_status="real",
                    model_version=CASCADE_MODEL_VERSION,
                    development_simulation=False,
                    notice="supplied cascade",
                    category="Insult" if bullying else None,
                    categories=[{"name": "Insult", "prob": 0.88}] if bullying else [],
                    gate_threshold=0.54,
                )

            def status(self):
                return {
                    "name": "Supplied cyberbullying cascade",
                    "status": "real",
                    "model_version": CASCADE_MODEL_VERSION,
                    "validated": False,
                    "categories": ["Insult", "Threat"],
                }

        self.classifier = StubClassifier()
        self.service = ClassifierService(self.classifier)

    def test_bullying_prediction_includes_supplied_cascade_category(self):
        result = self.service.classify("you are an idiot")

        self.assertEqual(result["label"], "Bullying")
        self.assertEqual(result["probability"], 0.91)
        self.assertEqual(result["category"], "Insult")
        self.assertEqual(result["model_version"], "cyberbullying-cascade-v4")
        self.assertFalse(result["development_simulation"])

    def test_clean_prediction_skips_category_head(self):
        result = self.service.classify("Good morning, friend")

        self.assertEqual(result["label"], "Clean")
        self.assertIsNone(result["category"])
        self.assertEqual(result["model_status"], "real")

    def test_compatibility_prediction_and_legacy_score_contract(self):
        with patch("model.classifier_service", self.service):
            bullying = predict_text("you are an idiot")
            clean = predict_text("hello friend")
            score, label, is_risky = score_text("you are an idiot")

        self.assertEqual(bullying["category"], "Insult")
        self.assertEqual(bullying["category_status"], "predicted")
        self.assertEqual(clean["category_status"], "skipped_clean")
        self.assertIsNone(clean["category"])
        self.assertEqual((score, label, is_risky), (0.91, "high_risk", True))
        self.assertEqual(self.classifier.seen_text, "you are an idiot")

    def test_standalone_hi_is_safe_but_other_messages_follow_the_model(self):
        with patch("model.classifier_service", self.service):
            greeting = predict_text("  HI!? ")
            bullying = predict_text("you are an idiot")

        self.assertEqual(greeting["model_classification"], "Bullying")
        self.assertEqual(greeting["classification_label"], "Clean")
        self.assertFalse(greeting["cyberbullying"])
        self.assertEqual(greeting["decision_override"], "standalone_greeting")
        self.assertEqual(greeting["p_bullying"], 0.91)
        self.assertEqual(greeting["categories"], [])
        self.assertEqual(bullying["classification_label"], "Bullying")
        self.assertIsNone(bullying["decision_override"])

    def test_debug_logging_reports_model_and_prediction(self):
        with patch("classifier_service._debug_predictions", True), self.assertLogs(
            "classifier_service", level="INFO"
        ) as captured:
            self.service.classify("test message")

        self.assertIn("Supplied cyberbullying cascade", captured.output[0])
        self.assertIn("cyberbullying-cascade-v4", captured.output[0])
        self.assertIn("prediction=Clean", captured.output[0])


if __name__ == "__main__":
    unittest.main()
