"""shap_text_core.py - pure-numpy building blocks for message-level SHAP on the cascade model.

Nothing in this module imports TensorFlow or Keras, and ``shap`` is imported lazily inside
``kernel_shap`` only. That keeps it importable (and unit-testable) in environments without the
model stack.

Feature definition
------------------
One feature per *model token*: ``tokens = tokenize(text)[:max_words]`` (the cleaned, de-leeted,
lower-cased words the model actually sees, see models/cyberbullying_cascade/cb_text.py).

"Feature absent" semantics (the Shapley value function v(S))
------------------------------------------------------------
* A token outside coalition S is blanked in place: word id 0 and all its char-n-gram ids 0 (PAD).
  The Keras model masks PAD positions in attention and in attention pooling, so a blanked token is
  invisible to the model while every other token keeps its position.
* If NO token is present, the input is exactly what the model gets for an empty message
  (``DualEncoder.encode("")``). Therefore  base_value == model output on "".
"""
from __future__ import annotations

import itertools
import math
from typing import Callable, Sequence

import numpy as np


# --------------------------------------------------------------------------- masking batcher
class MaskedTextBatcher:
    """Builds model inputs for arbitrary token coalitions of ONE message.

    ``encoder`` must be a ``cb_text.DualEncoder``; ``tokenize_fn`` must be ``cb_text.tokenize``.
    ``build(masks)`` accepts an (N, M) 0/1 (or float) array and returns ``(W, C)`` with shapes
    ``(N, max_words)`` and ``(N, max_words, K)``, both int32, ready for ``model.predict([W, C])``.
    """

    def __init__(self, encoder, tokenize_fn: Callable[[str], list[str]], text: str):
        self.encoder = encoder
        self.tokens: list[str] = list(tokenize_fn(text))[: encoder.max_words]
        self.m = len(self.tokens)
        self.max_words, self.k = int(encoder.max_words), int(encoder.K)
        unk = 1  # cb_text.UNK
        self._w_ids = np.array([encoder.word2idx.get(t, unk) for t in self.tokens], dtype=np.int32)
        self._c_ids = (
            np.stack([encoder._word_ngram_ids(t) for t in self.tokens]).astype(np.int32)
            if self.m
            else np.zeros((0, self.k), dtype=np.int32)
        )
        w0, c0 = encoder.encode("")
        self._w_empty, self._c_empty = w0.astype(np.int32), c0.astype(np.int32)

    def full_input(self) -> tuple[np.ndarray, np.ndarray]:
        """(W, C) for the complete message, shape (1, ...)."""
        return self.build(np.ones((1, self.m)))

    def empty_input(self) -> tuple[np.ndarray, np.ndarray]:
        return self.build(np.zeros((1, self.m)))

    def build(self, masks) -> tuple[np.ndarray, np.ndarray]:
        masks = np.asarray(masks)
        if masks.ndim != 2 or masks.shape[1] != self.m:
            raise ValueError(f"masks must have shape (N, {self.m}), got {masks.shape}")
        present = (masks > 0.5).astype(np.int32)
        n = present.shape[0]
        w = np.zeros((n, self.max_words), dtype=np.int32)
        c = np.zeros((n, self.max_words, self.k), dtype=np.int32)
        if self.m:
            w[:, : self.m] = present * self._w_ids[None, :]
            c[:, : self.m, :] = present[:, :, None] * self._c_ids[None, :, :]
        empty_rows = present.sum(axis=1) == 0
        if empty_rows.any():
            w[empty_rows] = self._w_empty
            c[empty_rows] = self._c_empty
        return w, c


# --------------------------------------------------------------------------- Shapley oracle
def exact_shapley(f: Callable[[np.ndarray], np.ndarray], m: int) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Brute-force Shapley values of the set function v(S) = f(mask_of_S).

    ``f`` maps an (K, m) 0/1 matrix to (K,) or (K, n_outputs). Cost is 2**m evaluations, so this is an
    ORACLE FOR TESTS (m <= ~12), not a production path.
    Returns ``(phi (m, n_out), base (n_out,), full (n_out,))`` with base = v(empty), full = v(all).
    Efficiency holds exactly:  base + phi.sum(0) == full.
    """
    if m < 1 or m > 20:
        raise ValueError("exact_shapley supports 1 <= m <= 20")
    n_sets = 1 << m
    codes = np.arange(n_sets)
    masks = ((codes[:, None] >> np.arange(m)[None, :]) & 1).astype(np.int8)
    values = np.asarray(f(masks), dtype=np.float64)
    if values.ndim == 1:
        values = values[:, None]
    if values.shape[0] != n_sets:
        raise ValueError("f must return one row per coalition")
    size = masks.sum(axis=1)
    weight = np.array([math.factorial(s) * math.factorial(m - s - 1) / math.factorial(m) for s in range(m)])
    phi = np.zeros((m, values.shape[1]))
    for i in range(m):
        bit = 1 << i
        without = codes[(codes & bit) == 0]
        phi[i] = (weight[size[without]][:, None] * (values[without | bit] - values[without])).sum(axis=0)
    return phi, values[0].copy(), values[n_sets - 1].copy()


def permutation_shapley(f: Callable[[np.ndarray], np.ndarray], m: int) -> np.ndarray:
    """Independent second formulation (average marginal contribution over ALL m! orderings); m <= 7."""
    if m > 7:
        raise ValueError("permutation_shapley is only for tiny m")
    phi, count = None, 0
    for order in itertools.permutations(range(m)):
        masks = np.zeros((m + 1, m), dtype=np.int8)
        for step, feature in enumerate(order):
            masks[step + 1:, feature] = 1
        v = np.asarray(f(masks), dtype=np.float64)
        v = v[:, None] if v.ndim == 1 else v
        contrib = np.zeros((m, v.shape[1]))
        for step, feature in enumerate(order):
            contrib[feature] = v[step + 1] - v[step]
        phi = contrib if phi is None else phi + contrib
        count += 1
    return phi / count


# --------------------------------------------------------------------------- shap library wrapper
def normalise_shap_values(values, expected_value, m: int, n_outputs: int) -> tuple[np.ndarray, np.ndarray]:
    """Return ``(phi (m, n_outputs), base (n_outputs,))`` from any shape ``KernelExplainer`` may emit
    for ONE explained row: list of (1, m) arrays (older shap), ndarray (1, m, n_out) (newer shap),
    ndarray (1, m) / (m,) for a single output, or an ``Explanation`` object with ``.values``."""
    if hasattr(values, "values"):  # shap.Explanation
        values = values.values
    if isinstance(values, list):
        arr = np.stack([np.asarray(v, dtype=np.float64).reshape(-1, m)[0] for v in values], axis=-1)  # (m, n_out)
    else:
        arr = np.asarray(values, dtype=np.float64)
        if arr.ndim == 1:
            arr = arr[:, None]
        elif arr.ndim == 2 and arr.shape == (1, m):
            arr = arr.T
        elif arr.ndim == 3 and arr.shape[0] == 1:
            arr = arr[0]
    if arr.shape != (m, n_outputs):
        raise ValueError(f"unexpected SHAP value shape {arr.shape}, expected {(m, n_outputs)}")
    base = np.asarray(expected_value, dtype=np.float64).reshape(-1)
    if base.shape != (n_outputs,):
        raise ValueError(f"unexpected SHAP baseline shape {base.shape}, expected {(n_outputs,)}")
    return arr, base


def kernel_shap(
    f: Callable[[np.ndarray], np.ndarray],
    m: int,
    n_outputs: int,
    *,
    nsamples: int,
    seed: int = 0,
    shap_module=None,
) -> tuple[np.ndarray, np.ndarray, bool]:
    """KernelSHAP over the binary token-presence vector with an all-absent background.

    ``f`` must map (N, m) -> (N, n_outputs) (multi-output keeps ONE shared set of model evaluations).
    Returns ``(phi (m, n_out), base (n_out,), exact)``. ``exact`` is True when ``nsamples`` covers every
    coalition (2**m - 2), in which case KernelSHAP equals the exact Shapley values.
    NOT executed in the authoring sandbox (``shap`` could not be installed): verify with the oracle test.
    """
    if m < 1:
        raise ValueError("need at least one token")
    shap = shap_module
    if shap is None:
        import shap as shap  # lazy; optional dependency
    background, instance = np.zeros((1, m)), np.ones((1, m))
    exact = m <= 20 and nsamples >= (1 << m) - 2
    np.random.seed(seed)  # KernelExplainer samples with numpy's global RNG
    explainer = shap.KernelExplainer(f, background)
    values = explainer.shap_values(instance, nsamples=int(nsamples), silent=True)
    phi, base = normalise_shap_values(values, explainer.expected_value, m, n_outputs)
    return phi, base, bool(exact)


def check_additivity(phi: np.ndarray, base: np.ndarray, full: np.ndarray, atol: float = 1e-4) -> bool:
    """True when base + sum(phi) reproduces the model output for every output (finite numbers only)."""
    total = base + phi.sum(axis=0)
    return bool(
        np.all(np.isfinite(phi)) and np.all(np.isfinite(base)) and np.all(np.isfinite(full))
        and np.allclose(total, full, rtol=0.0, atol=atol)
    )
