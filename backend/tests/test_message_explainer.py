"""Tests for MessageExplainerService and message explanation routes."""
from __future__ import annotations

import json
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

import numpy as np

BACKEND = Path(os.environ.get("CSL_BACKEND_DIR", Path(__file__).resolve().parents[1]))
for p in (BACKEND, Path(__file__).resolve().parent):
    if str(p) not in sys.path:
        sys.path.insert(0, str(p))

import main
from fastapi.testclient import TestClient
from main import app
from message_explainer import MessageExplainerService


class DummyEncoder:
    max_words = 96
    K = 32
    word2idx = {"you": 2, "are": 3, "an": 4, "idiot": 5, "hello": 6}

    def _word_ngram_ids(self, word: str):
        return np.zeros(self.K, dtype=np.uint16)

    def encode(self, text: str):
        tokens = text.split()
        w = np.zeros(self.max_words, dtype=np.int32)
        c = np.zeros((self.max_words, self.K), dtype=np.uint16)
        for i, tok in enumerate(tokens[: self.max_words]):
            w[i] = self.word2idx.get(tok, 1)
        return w, c


class DummyClassifier:
    encoder = DummyEncoder()
    category_names = ("Insult", "Harassment")

    def predict_arrays(self, word_ids: np.ndarray, char_ids: np.ndarray, batch_size: int = 128):
        n = word_ids.shape[0]
        g = 1.0 / (1.0 + np.exp(-0.1 * (word_ids > 0).sum(axis=1).astype(float)))
        c = np.zeros((n, 2))
        c[:, 0] = g * 0.8
        c[:, 1] = g * 0.2
        return g, c


class MessageExplainerTests(unittest.TestCase):
    def setUp(self):
        self.service = MessageExplainerService(
            enabled=True,
            max_tokens=40,
            max_evals=64,
            timeout_seconds=5.0,
            max_concurrent=1,
        )

    @patch("classifier_service.classifier_service._classifier", new_callable=lambda: DummyClassifier())
    def test_explainer_computes_successfully(self, mock_classifier):
        text = "you are an idiot"
        expected_p = float(1.0 / (1.0 + np.exp(-0.1 * 4)))
        prediction = {
            "classification_label": "Bullying",
            "p_bullying": expected_p,
            "category": "Insult",
            "model_version": "cyberbullying-cascade-v4",
        }
        res = self.service.explain_for_incident(text, prediction, stored_snippet="you are an idiot")
        self.assertEqual(res["status"], "computed")
        self.assertIn("tokens", res)
        self.assertTrue(res["gate"]["additivity_verified"])
        serialized = json.dumps(res, allow_nan=False)
        self.assertIsInstance(serialized, str)

    def test_disabled_returns_disabled(self):
        svc = MessageExplainerService(False, 40, 512, 1.5, 1)
        res = svc.explain_for_incident("test", {}, "test")
        self.assertEqual(res["status"], "unavailable")
        self.assertEqual(res["reason"], "disabled")

    def test_too_many_tokens(self):
        svc = MessageExplainerService(True, 1, 512, 1.5, 1)
        with patch("classifier_service.classifier_service._classifier", new_callable=lambda: DummyClassifier()):
            res = svc.explain_for_incident("you are an idiot", {}, "you are an idiot")
            self.assertEqual(res["status"], "unavailable")
            self.assertEqual(res["reason"], "too_many_tokens")

    def test_no_text_tokens(self):
        with patch("classifier_service.classifier_service._classifier", new_callable=lambda: DummyClassifier()):
            res = self.service.explain_for_incident("!!! ???", {}, "!!! ???")
            self.assertEqual(res["status"], "unavailable")
            self.assertEqual(res["reason"], "no_text_tokens")

    @patch("classifier_service.classifier_service._classifier", new_callable=lambda: DummyClassifier())
    def test_privacy_rule_omits_unstored_tokens(self, mock_classifier):
        expected_p = float(1.0 / (1.0 + np.exp(-0.1 * 4)))
        prediction = {"classification_label": "Bullying", "p_bullying": expected_p, "model_version": "cyberbullying-cascade-v4"}
        res = self.service.explain_for_incident("you are an idiot", prediction, stored_snippet="you are")
        self.assertEqual(res["status"], "computed")
        tokens = res["tokens"]
        token_words = [t["token"] for t in tokens]
        self.assertIn("you", token_words)
        self.assertNotIn("idiot", token_words)


class RouteRegressionTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        app.dependency_overrides[main.require_parent] = lambda: "parent@example.com"
        app.dependency_overrides[main._assert_parent_scope] = lambda req, auth: auth

    def tearDown(self):
        app.dependency_overrides.clear()

    def test_message_explanation_endpoint_not_recorded(self):
        resp = self.client.get(
            "/incidents/nonexistent_id/message-explanation?parentEmail=parent@example.com"
        )
        self.assertEqual(resp.status_code, 404)
