from __future__ import annotations

import hashlib
import importlib.metadata
import importlib.util
import logging
import os
import threading
import time
from datetime import datetime, timezone
from typing import Any

import numpy as np

from classifier_service import classifier_service, ModelUnavailableError
from models.cyberbullying_cascade.cb_text import tokenize
import shap_text_core

_logger = logging.getLogger(__name__)


def _finite_float(val: float) -> float:
    f = float(val)
    if not np.isfinite(f):
        raise ValueError("non-finite float")
    return round(f, 6)


class MessageExplainerService:
    def __init__(
        self,
        enabled: bool,
        max_tokens: int,
        max_evals: int,
        timeout_seconds: float,
        max_concurrent: int,
    ):
        self.enabled = enabled
        self.max_tokens = max_tokens
        self.max_evals = max_evals
        self.timeout_seconds = timeout_seconds
        self.semaphore = threading.BoundedSemaphore(max_concurrent)

    @classmethod
    def from_environment(cls) -> MessageExplainerService:
        enabled = os.environ.get("CHILDSAFELENS_MESSAGE_SHAP_ENABLED", "false").lower() in ("true", "1", "yes")
        try:
            max_tokens = int(os.environ.get("CHILDSAFELENS_MESSAGE_SHAP_MAX_TOKENS", "40"))
        except ValueError:
            max_tokens = 40
        try:
            max_evals = int(os.environ.get("CHILDSAFELENS_MESSAGE_SHAP_MAX_EVALS", "512"))
        except ValueError:
            max_evals = 512
        try:
            timeout_seconds = float(os.environ.get("CHILDSAFELENS_MESSAGE_SHAP_TIMEOUT_SECONDS", "1.5"))
        except ValueError:
            timeout_seconds = 1.5
        try:
            max_concurrent = int(os.environ.get("CHILDSAFELENS_MESSAGE_SHAP_MAX_CONCURRENT", "1"))
        except ValueError:
            max_concurrent = 1
        return cls(enabled, max_tokens, max_evals, timeout_seconds, max_concurrent)

    def _dependency_installed(self) -> bool:
        return importlib.util.find_spec("shap") is not None

    def status(self) -> dict[str, Any]:
        dep = self._dependency_installed()
        model_avail = True
        try:
            classifier_service._classifier.encoder  # type: ignore
        except Exception:
            model_avail = False

        if not self.enabled:
            st = "disabled"
            msg = "Message SHAP explainability is disabled."
        elif not dep:
            st = "dependency_unavailable"
            msg = "The optional 'shap' dependency is not installed."
        elif not model_avail:
            st = "model_unavailable"
            msg = "The underlying cascade model is unavailable."
        else:
            st = "available"
            msg = "Message SHAP explainability is available."

        shap_ver = None
        if dep:
            try:
                shap_ver = importlib.metadata.version("shap")
            except Exception:
                shap_ver = "unknown"

        return {
            "status": st,
            "dependency_installed": dep,
            "method": "KernelSHAP",
            "max_tokens": self.max_tokens,
            "max_evals": self.max_evals,
            "timeout_seconds": self.timeout_seconds,
            "message": msg,
            "shap_version": shap_ver,
        }

    def explain_for_incident(self, text: str, prediction: dict, stored_snippet: str) -> dict:
        if not self.enabled:
            return {"status": "unavailable", "reason": "disabled", "message": "Explanation unavailable", "method": "KernelSHAP"}
        if not self._dependency_installed():
            return {"status": "unavailable", "reason": "dependency_unavailable", "message": "Explanation unavailable", "method": "KernelSHAP"}

        try:
            classifier = classifier_service._classifier
            encoder = classifier.encoder  # type: ignore
            if encoder is None:
                return {"status": "unavailable", "reason": "model_unavailable", "message": "Explanation unavailable", "method": "KernelSHAP"}
        except Exception:
            return {"status": "unavailable", "reason": "model_unavailable", "message": "Explanation unavailable", "method": "KernelSHAP"}

        try:
            batcher = shap_text_core.MaskedTextBatcher(encoder, tokenize, text)
            m = batcher.m
            if m == 0:
                return {"status": "unavailable", "reason": "no_text_tokens", "message": "Explanation unavailable", "method": "KernelSHAP"}
            if m > self.max_tokens:
                return {"status": "unavailable", "reason": "too_many_tokens", "message": "Explanation unavailable", "method": "KernelSHAP"}
        except Exception as e:
            _logger.error(f"Error initializing MaskedTextBatcher: {type(e).__name__}")
            return {"status": "unavailable", "reason": "error", "message": "Explanation unavailable", "method": "KernelSHAP"}

        if not self.semaphore.acquire(blocking=False):
            return {"status": "unavailable", "reason": "busy", "message": "Explanation unavailable", "method": "KernelSHAP"}

        deadline = time.time() + self.timeout_seconds
        try:
            def check_deadline():
                if time.time() > deadline:
                    raise TimeoutError("Deadline exceeded")

            categories = list(classifier.category_names)
            pred_label = prediction.get("classification_label")
            pred_cat = prediction.get("category")
            cat_idx = None
            if pred_label == "Bullying" and prediction.get("decision_override") is None and pred_cat in categories:
                cat_idx = categories.index(pred_cat)

            def f(masks) -> np.ndarray:
                check_deadline()
                w, c = batcher.build(masks)
                g_arr, c_arr = classifier.predict_arrays(w, c)
                if cat_idx is not None:
                    out = np.column_stack([g_arr, c_arr[:, cat_idx]])
                else:
                    out = g_arr[:, None]
                return out

            # Full evaluation and checks
            masks_full = np.ones((1, m), dtype=np.int8)
            full_out = f(masks_full)[0]
            full_gate = float(full_out[0])
            expected_p_bullying = float(prediction.get("p_bullying", 0.0))
            if abs(full_gate - expected_p_bullying) > 1e-3:
                return {"status": "unavailable", "reason": "output_mismatch", "message": "Explanation unavailable", "method": "KernelSHAP"}

            nsamples = min(1 << m, self.max_evals) if m <= 20 else self.max_evals
            seed = int(hashlib.sha256(text.encode("utf-8")).hexdigest()[:8], 16)

            import shap
            phi, base, exact = shap_text_core.kernel_shap(
                f, m, full_out.shape[0], nsamples=nsamples, seed=seed, shap_module=shap
            )

            if not shap_text_core.check_additivity(phi, base, full_out, atol=1e-4):
                return {"status": "unavailable", "reason": "additivity_failed", "message": "Explanation unavailable", "method": "KernelSHAP"}

            # Privacy rule: tokens in snippet vs omitted
            snippet_tokens = set(tokenize(stored_snippet))
            tokens_list = []
            omitted_gate = 0.0
            omitted_cat = 0.0

            for idx, tok in enumerate(batcher.tokens):
                g_contrib = float(phi[idx, 0])
                c_contrib = float(phi[idx, 1]) if phi.shape[1] > 1 else 0.0
                if tok in snippet_tokens:
                    item: dict[str, Any] = {
                        "index": int(idx),
                        "token": str(tok),
                        "gate": _finite_float(g_contrib),
                    }
                    if phi.shape[1] > 1:
                        item["category"] = _finite_float(c_contrib)
                    tokens_list.append(item)
                else:
                    omitted_gate += g_contrib
                    if phi.shape[1] > 1:
                        omitted_cat += c_contrib

            gate_info = {
                "output": "p_bullying",
                "base_value": _finite_float(base[0]),
                "model_output": _finite_float(full_gate),
                "omitted_contribution": _finite_float(omitted_gate),
                "additivity_verified": True,
            }

            cat_info = None
            if phi.shape[1] > 1 and cat_idx is not None:
                cat_info = {
                    "output": f"p_{categories[cat_idx]}",
                    "name": str(categories[cat_idx]),
                    "base_value": _finite_float(base[1]),
                    "model_output": _finite_float(float(full_out[1])),
                    "omitted_contribution": _finite_float(omitted_cat),
                    "additivity_verified": True,
                }

            shap_ver = "unknown"
            try:
                shap_ver = importlib.metadata.version("shap")
            except Exception:
                pass

            model_ver = prediction.get("model_version", "cyberbullying-cascade-v4")
            computed_at = datetime.now(timezone.utc).isoformat()

            res: dict[str, Any] = {
                "status": "computed",
                "reason": None,
                "message": "Contributions explain the model's decision, not whether the message is truly harmful.",
                "method": "KernelSHAP",
                "exact": bool(exact),
                "masking": "word blanked in place; baseline = model output on an empty message",
                "model_version": str(model_ver),
                "shap_version": str(shap_ver),
                "computed_at": str(computed_at),
                "n_tokens": int(m),
                "n_evaluations": int(nsamples),
                "tokens": tokens_list,
                "gate": gate_info,
            }
            if cat_info is not None:
                res["category"] = cat_info
            return res

        except Exception as e:
            _logger.error(f"MessageExplainerService error: {type(e).__name__}: {e}")
            reason = "timeout" if isinstance(e, TimeoutError) else "error"
            return {"status": "unavailable", "reason": reason, "message": "Explanation unavailable", "method": "KernelSHAP"}
        finally:
            self.semaphore.release()


message_explainer_service = MessageExplainerService.from_environment()
