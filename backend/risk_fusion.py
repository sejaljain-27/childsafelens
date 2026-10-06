"""Optional XGBoost child-risk fusion interface; never a message classifier."""

from __future__ import annotations

import importlib
import importlib.util
import logging
import math
import os
from collections.abc import Callable, Mapping
from pathlib import Path
from typing import Any


FEATURE_ORDER = (
    "P",
    "D",
    "S",
    "M",
    "T",
    "E",
    "G",
    "H",
)
TARGET_REQUIRED_MESSAGE = (
    "SHAP unavailable: no independently labeled child-risk fusion training data is configured."
)
DEFAULT_MODEL_PATH = Path(__file__).parent / "risk_models" / "child_risk_fusion.ubj"
TARGET_VALIDATION_ENV = "CHILDSAFELENS_RISK_TRAINING_TARGET_VALIDATED"
EXPLANATION_UNAVAILABLE = "Explanation unavailable"
logger = logging.getLogger(__name__)


class RiskFusionService:
    """Load a declared XGBoost risk model or report that fusion is unavailable."""

    def __init__(
        self,
        predictor: Callable[[list[float]], Any] | None = None,
        *,
        model_version: str | None = None,
        status: str = "model_not_configured",
        message: str = TARGET_REQUIRED_MESSAGE,
        target_id: str | None = None,
        target_validated: bool = False,
        explainer: Callable[[list[float]], Mapping[str, Any]] | None = None,
        explanation_status: str = "dependency_unavailable",
        artifact_path: Path = DEFAULT_MODEL_PATH,
    ):
        self._predictor = predictor
        self._explainer = explainer
        self.model_version = model_version
        self._status = status
        self._message = message
        self.target_id = target_id
        self.target_validated = target_validated
        self._explanation_status = explanation_status
        self.artifact_path = artifact_path

    @classmethod
    def from_environment(cls) -> RiskFusionService:
        artifact_path = Path(os.environ.get("CHILDSAFELENS_RISK_MODEL", DEFAULT_MODEL_PATH))
        target = os.environ.get("CHILDSAFELENS_RISK_TRAINING_TARGET", "").strip()
        target_validated = (
            os.environ.get(TARGET_VALIDATION_ENV, "").strip().lower() == "true"
        )
        if not target or not target_validated:
            return cls(
                status="training_target_unavailable",
                message=TARGET_REQUIRED_MESSAGE,
                target_id=target or None,
                artifact_path=artifact_path,
            )
        if not artifact_path.is_file():
            return cls(
                status="artifact_not_found",
                message=f"Declared risk target '{target}', but no XGBoost risk model artifact exists.",
                target_id=target,
                target_validated=True,
                artifact_path=artifact_path,
            )
        if artifact_path.suffix.lower() not in {".json", ".ubj"}:
            raise ValueError("Risk-fusion artifacts must use XGBoost JSON or UBJ format.")

        if importlib.util.find_spec("xgboost") is None:
            return cls(
                status="dependency_unavailable",
                message="An XGBoost artifact is configured, but the optional xgboost package is not installed.",
                target_id=target,
                target_validated=True,
                artifact_path=artifact_path,
            )

        xgboost = importlib.import_module("xgboost")

        booster = xgboost.Booster()
        booster.load_model(str(artifact_path))
        model_feature_names = booster.feature_names
        if model_feature_names is None or tuple(model_feature_names) != FEATURE_ORDER:
            raise ValueError(
                "XGBoost risk model feature order must be "
                f"{list(FEATURE_ORDER)}, got {model_feature_names}."
            )
        if booster.attr("childsafelens_target_id") != target:
            raise ValueError(
                "XGBoost risk model target metadata must match "
                "CHILDSAFELENS_RISK_TRAINING_TARGET."
            )
        if booster.attr("childsafelens_output_scale") != "0_1":
            raise ValueError(
                "XGBoost risk model must declare "
                "childsafelens_output_scale=0_1."
            )

        def predict(features: list[float]) -> Any:
            matrix = xgboost.DMatrix([features], feature_names=list(FEATURE_ORDER))
            return booster.predict(matrix)

        explainer = None
        explanation_status = "dependency_unavailable"
        if importlib.util.find_spec("shap") is not None:
            try:
                shap = importlib.import_module("shap")
                tree_explainer = shap.TreeExplainer(booster)

                def explain(features: list[float]) -> dict[str, Any]:
                    matrix = xgboost.DMatrix(
                        [features], feature_names=list(FEATURE_ORDER)
                    )
                    shap_values = tree_explainer.shap_values(matrix)
                    if hasattr(shap_values, "values"):
                        shap_values = shap_values.values
                    values = (
                        shap_values.tolist()
                        if hasattr(shap_values, "tolist")
                        else shap_values
                    )
                    if (
                        values
                        and isinstance(values[0], list)
                        and len(values) == 1
                    ):
                        values = values[0]
                    if len(values) != len(FEATURE_ORDER):
                        raise ValueError("SHAP returned an unexpected feature shape.")

                    expected_value = tree_explainer.expected_value
                    if hasattr(expected_value, "tolist"):
                        expected_value = expected_value.tolist()
                    if isinstance(expected_value, list):
                        if len(expected_value) != 1:
                            raise ValueError(
                                "SHAP returned an unsupported multi-output baseline."
                            )
                        expected_value = expected_value[0]

                    baseline = float(expected_value)
                    contributions = [float(value) for value in values]
                    model_output_values = booster.predict(
                        matrix, output_margin=True
                    ).tolist()
                    if len(model_output_values) != 1:
                        raise ValueError(
                            "XGBoost returned an unexpected explanation output shape."
                        )
                    model_output = float(model_output_values[0])
                    if not all(
                        math.isfinite(value)
                        for value in [baseline, model_output, *contributions]
                    ):
                        raise ValueError("SHAP output contained non-finite values.")
                    reconstructed_output = baseline + sum(contributions)
                    if not math.isclose(
                        reconstructed_output,
                        model_output,
                        rel_tol=1e-5,
                        abs_tol=1e-5,
                    ):
                        raise ValueError(
                            "SHAP contributions did not match XGBoost raw output."
                        )
                    return {
                        "model_output": "raw_margin",
                        "base_value": baseline,
                        "feature_contributions": [
                            {"feature": name, "value": value}
                            for name, value in zip(
                                FEATURE_ORDER, contributions, strict=True
                            )
                        ],
                        "explained_output": model_output,
                        "reconstructed_output": reconstructed_output,
                        "additivity_verified": True,
                    }

                explainer = explain
                explanation_status = "available"
            except Exception as error:
                logger.warning(
                    "Unable to initialize SHAP TreeExplainer (%s).",
                    type(error).__name__,
                )
                explanation_status = "initialization_failed"

        return cls(
            predict,
            model_version=f"xgboost:{xgboost.__version__}",
            status="model_loaded",
            message=f"Loaded XGBoost risk-fusion model for declared target '{target}'.",
            target_id=target,
            target_validated=True,
            explainer=explainer,
            explanation_status=explanation_status,
            artifact_path=artifact_path,
        )

    def explainability_status(self) -> dict[str, Any]:
        if self._predictor is None:
            status = "model_unavailable"
        elif self._explanation_status == "available" and self._explainer is not None:
            status = "available"
        else:
            status = self._explanation_status
        return {
            "status": status,
            "configured": self._predictor is not None,
            "model_type": "XGBoost",
            "dependency_installed": importlib.util.find_spec("shap") is not None,
            "method": "TreeSHAP",
            "model_output": "raw_margin",
            "message": (
                "SHAP explanations are available for the loaded XGBoost model."
                if status == "available"
                else TARGET_REQUIRED_MESSAGE
                if self._predictor is None
                else EXPLANATION_UNAVAILABLE
            ),
        }

    def explain(self, features: Mapping[str, float | None]) -> dict[str, Any]:
        missing = [name for name in FEATURE_ORDER if features.get(name) is None]
        if self._predictor is None or self._explainer is None or missing:
            return {
                "status": "unavailable",
                "message": (
                    TARGET_REQUIRED_MESSAGE
                    if self._predictor is None
                    else EXPLANATION_UNAVAILABLE
                ),
                "missing_features": missing,
            }

        ordered_values = [float(features[name]) for name in FEATURE_ORDER]
        if any(not math.isfinite(value) for value in ordered_values):
            raise ValueError("SHAP explanation inputs must be finite numbers.")
        try:
            explanation = dict(self._explainer(ordered_values))
            return {"status": "computed", **explanation}
        except Exception as error:
            logger.warning(
                "Unable to calculate SHAP explanation (%s).",
                type(error).__name__,
                exc_info=True,
            )
            return {
                "status": "unavailable",
                "message": EXPLANATION_UNAVAILABLE,
                "missing_features": [],
            }

    def status(self) -> dict[str, Any]:
        return {
            "status": self._status,
            "configured": self._predictor is not None,
            "model_type": "XGBoost",
            "explainer": "TreeSHAP",
            "model_version": self.model_version,
            "model_loaded": self._predictor is not None,
            "training_target_available": self.target_validated,
            "training_target_validated": self.target_validated,
            "training_target": self.target_id,
            "artifact_path": str(self.artifact_path),
            "artifact_present": self.artifact_path.is_file(),
            "target_message": self._message,
            "artifact_format": "xgboost_json_or_ubj",
            "feature_order": list(FEATURE_ORDER),
        }

    def predict(self, features: Mapping[str, float | None]) -> dict[str, Any]:
        missing = [name for name in FEATURE_ORDER if features.get(name) is None]
        if self._predictor is None:
            return {
                "score": None,
                "status": self._status,
                "feature_order": list(FEATURE_ORDER),
                "missing_features": missing,
                "model_version": self.model_version,
                "message": self._message,
            }
        if missing:
            return {
                "score": None,
                "status": "insufficient_features",
                "feature_order": list(FEATURE_ORDER),
                "missing_features": missing,
                "model_version": self.model_version,
                "message": "XGBoost risk fusion requires every ordered risk feature.",
            }

        ordered_values = [float(features[name]) for name in FEATURE_ORDER]
        if any(not math.isfinite(value) for value in ordered_values):
            raise ValueError("XGBoost risk-fusion inputs must be finite numbers.")
        raw_prediction = self._predictor(ordered_values)
        try:
            if hasattr(raw_prediction, "item"):
                raw_prediction = raw_prediction.item()
            score = float(raw_prediction)
        except (TypeError, ValueError) as error:
            raise ValueError("XGBoost risk-fusion model must return one numeric score.") from error
        if not math.isfinite(score) or not 0 <= score <= 1:
            raise ValueError("XGBoost risk-fusion model output must be between 0 and 1.")
        return {
            "score": score,
            "status": "computed",
            "feature_order": list(FEATURE_ORDER),
            "missing_features": [],
            "model_version": self.model_version,
            "message": self._message,
        }


risk_fusion_service = RiskFusionService.from_environment()
