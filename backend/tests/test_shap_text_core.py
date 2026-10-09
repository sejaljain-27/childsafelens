"""Tests for shap_text_core.py. No TensorFlow needed. Run from backend/:  python -m unittest tests.test_shap_text_core -v
Uses the REAL cb_text encoder and the REAL vocabulary from cyberbullying_cascade_meta.json."""
import itertools
import json
import math
import os
import sys
import unittest
from pathlib import Path

import numpy as np

BACKEND = Path(os.environ.get("CSL_BACKEND_DIR", Path(__file__).resolve().parents[1]))
for p in (BACKEND, Path(__file__).resolve().parent):
    if str(p) not in sys.path:
        sys.path.insert(0, str(p))

from models.cyberbullying_cascade.cb_text import DualEncoder, tokenize  # noqa: E402  (pure numpy module)
from shap_text_core import (  # noqa: E402
    MaskedTextBatcher, check_additivity, exact_shapley, kernel_shap, normalise_shap_values, permutation_shapley,
)

META = json.load(open(BACKEND / "models" / "cyberbullying_cascade" / "cyberbullying_cascade_meta.json", encoding="utf-8"))
ENC = DualEncoder(META["word2idx"], META["config"])
TEXTS = [
    "you are an idiot",
    "kal subah bahar mil, tujhe sabak sikha dunga",
    "u r such a st00pid l0ser!!! f u c k off",
    "send me 5k by 10pm, 3rd floor",
    "Have a nice day 😂",
]


class MaskedBatcherTests(unittest.TestCase):
    def test_full_row_equals_model_encoding(self):
        for text in TEXTS:
            b = MaskedTextBatcher(ENC, tokenize, text)
            w, c = b.full_input()
            w_ref, c_ref = ENC.encode(text)
            np.testing.assert_array_equal(w[0], w_ref)
            np.testing.assert_array_equal(c[0], c_ref.astype(np.int32))

    def test_empty_row_equals_empty_message_encoding(self):
        b = MaskedTextBatcher(ENC, tokenize, TEXTS[0])
        w, c = b.empty_input()
        w_ref, c_ref = ENC.encode("")
        np.testing.assert_array_equal(w[0], w_ref)
        np.testing.assert_array_equal(c[0], c_ref.astype(np.int32))

    def test_single_token_rows_blank_everything_else(self):
        b = MaskedTextBatcher(ENC, tokenize, TEXTS[1])
        w_full, c_full = b.full_input()
        eye = np.eye(b.m)
        w, c = b.build(eye)
        for i in range(b.m):
            expect_w = np.zeros(b.max_words, dtype=np.int32)
            expect_w[i] = w_full[0, i]
            np.testing.assert_array_equal(w[i], expect_w)
            nz_positions = np.where(c[i].any(axis=1))[0].tolist()
            self.assertEqual(nz_positions, [i])
            np.testing.assert_array_equal(c[i, i], c_full[0, i])

    def test_float_and_bool_masks_are_accepted(self):
        b = MaskedTextBatcher(ENC, tokenize, TEXTS[0])
        m = np.array([[1.0, 0.0, 1.0, 1.0]])
        w1, _ = b.build(m)
        w2, _ = b.build(m.astype(bool))
        np.testing.assert_array_equal(w1, w2)

    def test_tokens_are_truncated_like_the_model(self):
        long_text = " ".join(["idiot"] * 300)
        b = MaskedTextBatcher(ENC, tokenize, long_text)
        self.assertEqual(b.m, ENC.max_words)
        w, _ = b.full_input()
        np.testing.assert_array_equal(w[0], ENC.encode(long_text)[0])

    def test_text_without_tokens_has_zero_features(self):
        b = MaskedTextBatcher(ENC, tokenize, "!!! ???")
        self.assertEqual(b.m, 0)

    def test_bad_mask_shape_rejected(self):
        b = MaskedTextBatcher(ENC, tokenize, TEXTS[0])
        with self.assertRaises(ValueError):
            b.build(np.ones((2, b.m + 1)))

    def test_features_are_exactly_the_tokens_the_model_sees(self):
        # NOTE: the supplied normaliser turns "10pm," into "iopm" (punctuation defeats its number+unit
        # exemption). The model was trained with it, so explanations must show it as-is, not "fix" it.
        for text in TEXTS:
            self.assertEqual(MaskedTextBatcher(ENC, tokenize, text).tokens, tokenize(text)[: ENC.max_words])
        self.assertIn("iopm", MaskedTextBatcher(ENC, tokenize, TEXTS[3]).tokens)


class ShapleyOracleTests(unittest.TestCase):
    def test_linear_function_recovers_weights(self):
        w = np.array([0.3, -0.1, 0.25, 0.0])
        phi, base, full = exact_shapley(lambda m: 0.2 + m @ w, 4)
        np.testing.assert_allclose(phi[:, 0], w, atol=1e-12)
        self.assertAlmostEqual(base[0], 0.2)
        self.assertAlmostEqual(full[0], 0.2 + w.sum())

    def test_and_interaction_splits_equally_and_dummy_is_zero(self):
        phi, base, full = exact_shapley(lambda m: (m[:, 0] * m[:, 1]).astype(float), 3)
        np.testing.assert_allclose(phi[:, 0], [0.5, 0.5, 0.0], atol=1e-12)

    def test_efficiency_on_random_nonlinear_multi_output(self):
        rng = np.random.default_rng(0)
        W1, W2 = rng.normal(size=(5, 6)), rng.normal(size=(6, 2))
        f = lambda m: 1 / (1 + np.exp(-np.tanh(m @ W1) @ W2))
        phi, base, full = exact_shapley(f, 5)
        self.assertEqual(phi.shape, (5, 2))
        self.assertTrue(check_additivity(phi, base, full, atol=1e-10))

    def test_two_independent_formulations_agree(self):
        rng = np.random.default_rng(1)
        W1, W2 = rng.normal(size=(6, 5)), rng.normal(size=(5,))
        f = lambda m: np.tanh(m @ W1) @ W2
        phi_a, _, _ = exact_shapley(f, 6)
        phi_b = permutation_shapley(f, 6)
        np.testing.assert_allclose(phi_a, phi_b, atol=1e-10)

    def test_symmetry(self):
        phi, _, _ = exact_shapley(lambda m: np.sqrt(m[:, 0] + m[:, 1] + 2 * m[:, 2]), 3)
        self.assertAlmostEqual(phi[0, 0], phi[1, 0], places=12)

    def test_additivity_check_detects_violations_and_nonfinite(self):
        phi = np.array([[0.1], [0.2]])
        self.assertTrue(check_additivity(phi, np.array([0.3]), np.array([0.6])))
        self.assertFalse(check_additivity(phi, np.array([0.3]), np.array([0.9])))
        self.assertFalse(check_additivity(np.array([[np.nan], [0.2]]), np.array([0.3]), np.array([0.6])))


class ShapShapeNormalisationTests(unittest.TestCase):
    def setUp(self):
        self.phi = np.array([[0.1, -0.2], [0.3, 0.4], [0.0, 0.05]])  # (m=3, n_out=2)
        self.base = np.array([0.5, 0.25])

    def test_old_list_style(self):
        values = [self.phi[:, [k]].T for k in range(2)]  # list of (1, m)
        phi, base = normalise_shap_values(values, self.base, 3, 2)
        np.testing.assert_allclose(phi, self.phi)

    def test_new_ndarray_style(self):
        phi, base = normalise_shap_values(self.phi[None, :, :], self.base, 3, 2)
        np.testing.assert_allclose(phi, self.phi)

    def test_single_output_styles(self):
        for raw in (self.phi[:, 0], self.phi[:, 0][None, :]):
            phi, base = normalise_shap_values(raw, [0.5], 3, 1)
            np.testing.assert_allclose(phi[:, 0], self.phi[:, 0])

    def test_wrong_shape_fails_closed(self):
        with self.assertRaises(ValueError):
            normalise_shap_values(np.zeros((1, 4, 2)), self.base, 3, 2)
        with self.assertRaises(ValueError):
            normalise_shap_values(self.phi[None], [0.5], 3, 2)


class KernelShapPlumbingTests(unittest.TestCase):
    """Plumbing check with a FAKE shap module that computes exact Shapley values (the real library is
    verified separately, see ShapLibraryOracleTests)."""

    def test_wrapper_with_fake_module(self):
        class FakeExplainer:
            def __init__(self, f, background):
                self.f, self.m = f, background.shape[1]
                self.expected_value = np.asarray(f(background))[0]

            def shap_values(self, x, nsamples, silent):
                phi, _, _ = exact_shapley(self.f, self.m)
                return phi[None, :, :]  # newer-shap style (1, m, n_out)

        class FakeShap:
            KernelExplainer = FakeExplainer

        W = np.array([[0.2, -0.1], [0.5, 0.3], [0.0, 0.7]])
        f = lambda m: 1 / (1 + np.exp(-(np.asarray(m) @ W)))
        phi, base, exact = kernel_shap(f, 3, 2, nsamples=62, shap_module=FakeShap)
        self.assertTrue(exact)
        full = f(np.ones((1, 3)))[0]
        self.assertTrue(check_additivity(phi, base, full, atol=1e-10))
        _, _, exact2 = kernel_shap(f, 3, 2, nsamples=5, shap_module=FakeShap)
        self.assertFalse(exact2)


try:
    import shap as _real_shap  # noqa: F401
    HAVE_SHAP = True
except Exception:  # pragma: no cover
    HAVE_SHAP = False


@unittest.skipUnless(HAVE_SHAP, "the optional 'shap' package is not installed")
class ShapLibraryOracleTests(unittest.TestCase):
    """THE test that proves the installed shap version is wired correctly: exact-mode KernelSHAP must match
    the brute-force oracle, for single and multi-output functions."""

    def test_exact_mode_matches_bruteforce(self):
        rng = np.random.default_rng(3)
        m = 5
        W1, W2 = rng.normal(size=(m, 6)), rng.normal(size=(6, 2))
        f = lambda m: 1 / (1 + np.exp(-np.tanh(m @ W1) @ W2))
        phi_oracle, base_oracle, full_oracle = exact_shapley(f, m)
        phi_shap, base_shap, exact = kernel_shap(f, m, 2, nsamples=(1 << m) - 2)
        self.assertTrue(exact)
        np.testing.assert_allclose(base_shap, base_oracle, atol=1e-5)
        np.testing.assert_allclose(phi_shap, phi_oracle, atol=1e-4)
