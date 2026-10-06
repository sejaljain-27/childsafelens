"""Compatibility functions backed by the replaceable classifier service."""

import re

from classifier_service import classifier_service


def _is_standalone_hi(text: str) -> bool:
    return re.fullmatch(r"hi[.!?,]*", text.strip(), flags=re.IGNORECASE) is not None


def classifier_status():
    return classifier_service.status()


def predict_text(text: str) -> dict:
    """Return the cascade gate and, for bullying, its category prediction."""
    classification = classifier_service.classify(text)
    model_is_bullying = classification["label"] == "Bullying"
    decision_override = "standalone_greeting" if _is_standalone_hi(text) else None
    is_bullying = model_is_bullying and decision_override is None
    probability = classification["probability"]
    category = classification["category"] if is_bullying else None
    return {
        "risk_score": probability,
        "p_bullying": probability,
        "gate_threshold": classification["gate_threshold"],
        "is_risky": is_bullying,
        "cyberbullying": is_bullying,
        "classification": "CYBERBULLYING" if is_bullying else "CLEAN",
        "incident_created": False,
        "label": "high_risk" if is_bullying else "low_risk",
        "stage1_label": classification["label"],
        "model_classification": classification["label"],
        "decision_override": decision_override,
        "stage1_status": classification["model_status"],
        "classification_label": "Bullying" if is_bullying else "Clean",
        "classification_confidence": classification["confidence"],
        "model_status": classification["model_status"],
        "model_version": classification["model_version"],
        "development_simulation": classification["development_simulation"],
        "classification_notice": classification["notice"],
        "category": category,
        "categories": classification["categories"] if is_bullying else [],
        "category_status": "predicted" if is_bullying else "skipped_clean",
        "stage": (
            "Stage 1 passed -> Stage 2 category head"
            if is_bullying
            else "Standalone greeting safety override"
            if decision_override
            else "Stage 1: early exit (Clean)"
        ),
    }


def score_text(text: str):
    """Return the legacy (risk_score, risk_level, is_risky) tuple."""
    result = predict_text(text)
    return result["risk_score"], result["label"], result["is_risky"]
