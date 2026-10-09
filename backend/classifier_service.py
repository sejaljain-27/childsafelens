"""Classifier adapter for the supplied two-stage cascade model."""

import logging
import os
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Literal, Protocol

import numpy as np


ClassificationLabel = Literal["Bullying", "Clean"]
CASCADE_MODEL_VERSION = "cyberbullying-cascade-v4"
_logger = logging.getLogger(__name__)
_debug_predictions = os.environ.get("CHILDSAFELENS_CLASSIFIER_DEBUG") == "1"


@dataclass(frozen=True)
class ClassificationResult:
    label: ClassificationLabel
    probability: float
    confidence: None
    model_status: Literal["real"]
    model_version: str
    development_simulation: bool
    notice: str
    category: str | None
    categories: list[dict[str, str | float]]
    gate_threshold: float


class CyberbullyingClassifier(Protocol):
    def classify(self, text: str) -> ClassificationResult: ...

    def status(self) -> dict[str, Any]: ...


class ModelUnavailableError(RuntimeError):
    """Raised when the supplied cascade is unavailable for classification."""


class UnavailableCascadeClassifier:
    def __init__(self, error: Exception, artifact_path: Path):
        self.error = error
        self.artifact_path = Path(artifact_path)

    def classify(self, text: str) -> ClassificationResult:
        raise ModelUnavailableError(
            "The supplied cyberbullying cascade is unavailable."
        ) from self.error

    def status(self) -> dict[str, Any]:
        return {
            "name": "Supplied cyberbullying cascade",
            "status": "model_not_configured",
            "model_version": CASCADE_MODEL_VERSION,
            "artifact_present": self.artifact_path.is_file(),
            "development_simulation": False,
            "validated": False,
            "categories": [],
        }

    @property
    def encoder(self):
        return None

    @property
    def category_names(self):
        return ()

    def predict_arrays(self, word_ids, char_ids, batch_size=128):
        raise ModelUnavailableError("Model unavailable")


class CascadeCyberbullyingClassifier:
    """Adapter for the supplied cascade's gate and category predictions."""

    MODEL_VERSION = CASCADE_MODEL_VERSION
    NOTICE = (
        "Using the supplied cyberbullying cascade model. Model performance has not "
        "been independently validated by this integration."
    )

    def __init__(self, artifact_path: Path, metadata_path: Path):
        self.artifact_path = Path(artifact_path)
        self.metadata_path = Path(metadata_path)
        if not self.artifact_path.is_file():
            raise FileNotFoundError(f"Cascade model artifact not found: {self.artifact_path}")
        if not self.metadata_path.is_file():
            raise FileNotFoundError(f"Cascade model metadata not found: {self.metadata_path}")

        from models.cyberbullying_cascade.cb_model import CascadePredictor

        self._predictor = CascadePredictor(
            self.metadata_path,
            self.artifact_path,
            backend="keras",
        )
        self.categories = tuple(self._predictor.categories)
        self.gate_threshold = float(self._predictor.gate_threshold)
        self.category_threshold = float(self._predictor.cat_threshold)

    @property
    def encoder(self):
        return self._predictor.enc

    @property
    def category_names(self):
        return self.categories

    def predict_arrays(self, word_ids: np.ndarray, char_ids: np.ndarray, batch_size: int = 128) -> tuple[np.ndarray, np.ndarray]:
        g, c = self._predictor.model.predict(
            [word_ids.astype(np.int32), char_ids.astype(np.int32)],
            batch_size=batch_size,
            verbose=0,
        )
        return g[:, 0], c

    def classify(self, text: str) -> ClassificationResult:
        prediction = self._predictor.predict(text)
        label = prediction.get("label")
        p_bullying = float(prediction.get("p_bullying", float("nan")))
        if label not in ("Bullying", "Clean") or not 0.0 <= p_bullying <= 1.0:
            raise ValueError("The supplied cascade returned an invalid prediction.")

        category = None
        categories: list[dict[str, str | float]] = []
        if label == "Bullying":
            predicted_categories = prediction.get("categories")
            if not isinstance(predicted_categories, list) or not predicted_categories:
                raise ValueError("The supplied cascade returned an invalid category prediction.")
            for item in predicted_categories:
                name = item.get("name")
                category_probability = float(item.get("prob", float("nan")))
                if (
                    name not in self.categories
                    or not 0.0 <= category_probability <= 1.0
                ):
                    raise ValueError("The supplied cascade returned an invalid category prediction.")
                categories.append({"name": name, "prob": category_probability})
            category = str(categories[0]["name"])

        return ClassificationResult(
            label=label,
            probability=p_bullying,
            confidence=None,
            model_status="real",
            model_version=self.MODEL_VERSION,
            development_simulation=False,
            notice=self.NOTICE,
            category=category,
            categories=categories,
            gate_threshold=self.gate_threshold,
        )

    def status(self) -> dict[str, Any]:
        return {
            "name": "Supplied cyberbullying cascade",
            "status": "real",
            "model_version": self.MODEL_VERSION,
            "artifact_present": self.artifact_path.is_file(),
            "development_simulation": False,
            "validated": False,
            "categories": list(self.categories),
            "gate_threshold": self.gate_threshold,
            "category_threshold": self.category_threshold,
        }


class ClassifierService:
    """Stable adapter consumed by prediction and research pipeline code."""

    def __init__(self, classifier: CyberbullyingClassifier):
        self._classifier = classifier

    def classify(self, text: str) -> dict[str, Any]:
        result = asdict(self._classifier.classify(text))
        if _debug_predictions:
            model_name = self._classifier.status()["name"]
            _logger.info(
                "Classifier model=%s version=%s prediction=%s "
                "p_bullying=%.6f gate_threshold=%.6f categories=%s",
                model_name,
                result["model_version"],
                result["label"],
                result["probability"],
                result["gate_threshold"],
                result["categories"],
            )
        else:
            _logger.debug(
                "Classifier model_version=%s prediction=%s bullying_probability=%.6f",
                result["model_version"],
                result["label"],
                result["probability"],
            )
        return result

    def status(self) -> dict[str, Any]:
        return self._classifier.status()


_model_dir = Path(os.environ.get(
    "CHILDSAFELENS_CASCADE_MODEL_DIR",
    Path(__file__).parent / "models" / "cyberbullying_cascade",
))
_artifact_path = Path(os.environ.get(
    "CHILDSAFELENS_CASCADE_MODEL_PATH",
    _model_dir / "cyberbullying_cascade.keras",
))
_metadata_path = Path(os.environ.get(
    "CHILDSAFELENS_CASCADE_METADATA_PATH",
    _model_dir / "cyberbullying_cascade_meta.json",
))
try:
    classifier = CascadeCyberbullyingClassifier(_artifact_path, _metadata_path)
except Exception as error:
    _logger.exception("Unable to load the supplied cyberbullying cascade model.")
    classifier = UnavailableCascadeClassifier(error, _artifact_path)
classifier_service = ClassifierService(classifier)
