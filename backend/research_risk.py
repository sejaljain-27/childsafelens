"""Evidence-only contextual risk features for the existing incident flow."""

from __future__ import annotations

import hashlib
import hmac
import math
import os
import re
import secrets
from collections import Counter
from datetime import datetime, timedelta, timezone
from typing import Any, Iterable, Mapping

import networkx as nx

from classifier_service import CASCADE_MODEL_VERSION
from model import classifier_status
from risk_fusion import risk_fusion_service

SEVERITY_CATEGORIES = frozenset(
    {"insult", "harassment", "humiliation", "threat", "blackmail", "physical_harm"}
)
INCIDENT_SCORE_COMPONENTS = ("classifier", "targeting", "severity", "multimodal")
TARGETING_SIGNALS = (
    "direct_mention",
    "child_name_reference",
    "reply_to_child",
    "personal_reference",
    "recipient_is_child",
    "sender_to_child_relationship",
    "second_person_reference",
    "direct_personal_attack",
)
TARGETING_FEATURES = TARGETING_SIGNALS
SOCIAL_GRAPH_FEATURES = ("attackers", "concentration", "frequency")
TARGETING_RESEARCH_WEIGHTS = {name: 1.0 for name in TARGETING_FEATURES}
SEVERITY_RESEARCH_WEIGHTS = {
    "insult": 0.20,
    "harassment": 0.35,
    "humiliation": 0.40,
    "threat": 0.70,
    "blackmail": 0.80,
    "physical_harm": 1.00,
}
FUSION_FEATURES = ("P", "D", "S", "M", "T", "E", "G", "H")
FUSION_RESEARCH_WEIGHTS = {
    "P": 0.20,
    "D": 0.15,
    "S": 0.20,
    "M": 0.10,
    "T": 0.10,
    "E": 0.10,
    "G": 0.05,
    "H": 0.10,
}
_GRAPH_PSEUDONYM_KEY = secrets.token_bytes(32)
_SECOND_PERSON_REFERENCE = re.compile(
    r"(?<!\w)(?:you|your|yours|yourself|yourselves|tu|tum|tera|teri|tere|"
    r"tujhe|tumhe|tumhara|tumhari|tumhare|aap|apka|apki|apke)(?!\w)",
    flags=re.IGNORECASE,
)
_TEXT_SEVERITY_CUES = {
    "insult": (
        "stupid", "idiot", "ugly", "loser", "dumb", "worthless", "useless",
        "moron", "pathetic", "fool",
    ),
    "harassment": (
        "bully", "bullying", "harass", "harassment", "stop messaging me",
    ),
    "humiliation": (
        "nobody likes you", "everyone laughs at you", "make fun of you",
        "you are embarrassing", "you are useless",
    ),
    "threat": (
        "i will hurt you", "i am going to hurt you", "i will kill you",
        "i am going to kill you", "i will attack you", "i will beat you",
    ),
    "blackmail": (
        "unless you pay", "or i will expose you", "i will leak your",
        "send me money or",
    ),
    "physical_harm": (
        "hurt you", "kill you", "attack you", "beat you", "hit you",
    ),
}


def configured_weights(prefix: str, features: Iterable[str]) -> dict[str, float] | None:
    names = tuple(features)
    env_names = {
        name: f"CHILDSAFELENS_{prefix.upper()}_{name.upper()}_WEIGHT"
        for name in names
    }
    present = [os.environ.get(env_name) for env_name in env_names.values()]
    if not any(value is not None for value in present):
        return None
    if any(value is None for value in present):
        return None
    return {name: float(os.environ[env_name]) for name, env_name in env_names.items()}


def _bounded_value(name: str, value: float) -> float:
    if not math.isfinite(value) or not 0 <= value <= 1:
        raise ValueError(f"{name} must be a finite number between 0 and 1.")
    return value


def _normalized_weights(weights: Mapping[str, float] | None, features: Iterable[str]):
    feature_names = tuple(features)
    if weights is None or any(name not in weights for name in feature_names):
        return None
    selected = {name: float(weights[name]) for name in feature_names}
    if any(not math.isfinite(weight) or weight < 0 for weight in selected.values()):
        raise ValueError("Feature weights must be finite and non-negative.")
    total = sum(selected.values())
    if total <= 0:
        raise ValueError("At least one feature weight must be positive.")
    return {name: weight / total for name, weight in selected.items()}


def weighted_score(
    values: Mapping[str, float | None],
    weights: Mapping[str, float] | None,
) -> float | None:
    """Combine evidence only when every required value and configured weight exists."""
    normalized = _normalized_weights(weights, values)
    if normalized is None or any(value is None for value in values.values()):
        return None
    return sum(
        normalized[name] * _bounded_value(name, float(value))
        for name, value in values.items()
    )


def current_incident_score(
    classifier_probability: float | None,
    targeting_score: float | None,
    severity_score: float | None,
    multimodal_score: float | None,
    weights: Mapping[str, float] | None,
) -> dict[str, Any]:
    """Combine only complete, observed component scores with configured weights."""
    values = {
        "classifier": classifier_probability,
        "targeting": targeting_score,
        "severity": severity_score,
        "multimodal": multimodal_score,
    }
    for name, value in values.items():
        if value is not None:
            _bounded_value(name, float(value))

    missing_components = [name for name, value in values.items() if value is None]
    if weights is None:
        score = None
        status = "weights_not_configured"
        normalized_weights = None
    elif missing_components:
        score = None
        status = "insufficient_component_evidence"
        normalized_weights = _normalized_weights(weights, INCIDENT_SCORE_COMPONENTS)
    else:
        normalized_weights = _normalized_weights(weights, INCIDENT_SCORE_COMPONENTS)
        if normalized_weights is None:
            score = None
            status = "weights_not_configured"
        else:
            score = sum(
                normalized_weights[name] * float(values[name])
                for name in INCIDENT_SCORE_COMPONENTS
            )
            status = "computed"

    return {
        "score": score,
        "status": status,
        "components": values,
        "missing_components": missing_components,
        "weights": normalized_weights,
        "weight_status": (
            "configured_development_parameters"
            if normalized_weights is not None
            else "not_configured"
        ),
    }


def _contains_phrase(text: str, phrase: str) -> bool:
    return re.search(
        rf"(?<!\w){re.escape(phrase.strip())}(?!\w)",
        text,
        flags=re.IGNORECASE,
    ) is not None


def targeting_evidence(
    text: str,
    child_name: str | None = None,
    child_username: str | None = None,
    reply_to_child: bool | None = None,
    personal_reference: bool | None = None,
    weights: Mapping[str, float] | None = None,
    recipient_is_child: bool | None = None,
    sender_to_child_relationship: bool | None = None,
) -> dict[str, Any]:
    """Analyze available text/context without treating absent context as negative."""
    direct_mention = None
    if child_username and child_username.strip():
        username = child_username.strip().lstrip("@")
        direct_mention = re.search(
            rf"(?<![\w@])@?{re.escape(username)}(?!\w)",
            text,
            flags=re.IGNORECASE,
        ) is not None

    name_reference = None
    if child_name and child_name.strip():
        name_reference = _contains_phrase(text, child_name)

    personal_attack = any(
        _contains_phrase(text, cue)
        for category in ("insult", "harassment", "humiliation", "threat", "blackmail")
        for cue in _TEXT_SEVERITY_CUES[category]
    )
    indicators: dict[str, bool | None] = {
        "direct_mention": direct_mention,
        "child_name_reference": name_reference,
        "reply_to_child": reply_to_child,
        "personal_reference": personal_reference,
        "recipient_is_child": recipient_is_child,
        "sender_to_child_relationship": sender_to_child_relationship,
        "second_person_reference": bool(_SECOND_PERSON_REFERENCE.search(text)),
        "direct_personal_attack": personal_attack,
    }
    available = {
        name: value
        for name, value in indicators.items()
        if value is not None
    }
    supporting_evidence = [
        name for name, value in available.items() if value is True
    ]
    effective_weights = weights or _research_weights(
        "targeting", TARGETING_RESEARCH_WEIGHTS
    )
    normalized_weights = _normalized_weights(effective_weights, available) if available else None
    score = None
    if normalized_weights is not None:
        score = sum(
            normalized_weights[name] * float(value)
            for name, value in available.items()
        )
    return {
        "status": (
            "computed"
            if score is not None
            else "insufficient_evidence"
        ),
        "analysis_status": "completed",
        "indicators": indicators,
        "available_signals": list(available),
        "supporting_evidence": supporting_evidence,
        "score": score,
        "score_status": (
            "computed_from_available_signals"
            if score is not None
            else "insufficient_evidence"
            if not available
            else "weights_not_configured"
        ),
    }


def severity_evidence(
    indicators: Iterable[str],
    weights: Mapping[str, float] | None = None,
    evidence_provided: bool | None = None,
    text: str | None = None,
    category: Any = None,
) -> dict[str, Any]:
    text_evidence = {
        category: [
            cue for cue in cues
            if _contains_phrase(text, cue)
        ]
        for category, cues in _TEXT_SEVERITY_CUES.items()
    } if text is not None else {}
    text_indicators = {
        category
        for category, cues in text_evidence.items()
        if cues
    }
    category_indicators = _severity_categories([category])
    observed = sorted(
        {
            value
            for value in indicators
            if value in SEVERITY_CATEGORIES
        }
        | text_indicators
        | category_indicators
    )
    has_evidence_source = (
        evidence_provided is True
        or text is not None
        or bool(observed)
    )
    score_weights = weights or _research_weights(
        "severity", SEVERITY_RESEARCH_WEIGHTS
    )
    category_name = _severity_category(category)
    score = (
        _bounded_value(
            f"severity_weight_{category_name}",
            float(score_weights[category_name]),
        )
        if category_name in score_weights
        else (
            sum(
                _bounded_value(
                    f"severity_weight_{name}", float(score_weights[name])
                )
                for name in observed
            ) / len(observed)
            if observed and all(name in score_weights for name in observed)
            else None
        )
    )
    return {
        "status": "available" if observed else "insufficient_evidence",
        "analysis_status": (
            "completed" if has_evidence_source else "not_available"
        ),
        "indicators": observed,
        "textual_evidence": {
            category: cues
            for category, cues in text_evidence.items()
            if cues
        },
        "evidence_sources": [
            source
            for source, available in (
                ("text", text is not None),
                ("provided_indicators", evidence_provided is True),
                ("current_category", category_name is not None),
            )
            if available
        ],
        "score": score,
        "score_status": (
            "calculated_from_current_category"
            if score is not None and category_name is not None
            else "research_weighted_severity"
            if score is not None and observed
            else "no_severity_indicators"
            if score == 0
            else "insufficient_evidence"
        ),
    }


def _timestamp_seconds(value: Any) -> float | None:
    try:
        if isinstance(value, (int, float)):
            numeric = float(value)
            return numeric / 1000 if abs(numeric) >= 100_000_000_000 else numeric
        if isinstance(value, str):
            normalized = value.replace("Z", "+00:00")
            parsed = datetime.fromisoformat(normalized)
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=timezone.utc)
            return parsed.timestamp()
    except (OverflowError, OSError, TypeError, ValueError):
        return None
    return None


def _configured_parameter(
    name: str,
    minimum: float,
    maximum: float | None = None,
) -> float | None:
    raw_value = os.environ.get(name)
    if raw_value is None:
        return None
    try:
        value = float(raw_value)
    except ValueError as error:
        raise ValueError(f"{name} must be a number.") from error
    if not math.isfinite(value) or value < minimum or (
        maximum is not None and value > maximum
    ):
        bounds = (
            f"between {minimum} and {maximum}"
            if maximum is not None
            else f"at least {minimum}"
        )
        raise ValueError(f"{name} must be finite and {bounds}.")
    return value


def _research_weights(prefix: str, defaults: Mapping[str, float]) -> dict[str, float]:
    weights = dict(defaults)
    for name, default in defaults.items():
        env_name = f"CHILDSAFELENS_{prefix.upper()}_{name.upper()}_WEIGHT"
        raw_value = os.environ.get(env_name)
        if raw_value is None:
            weights[name] = default
            continue
        try:
            value = float(raw_value)
        except ValueError as error:
            raise ValueError(f"{env_name} must be a number.") from error
        if not math.isfinite(value) or value < 0:
            raise ValueError(f"{env_name} must be finite and non-negative.")
        weights[name] = value
    if not any(weight > 0 for weight in weights.values()):
        raise ValueError(f"At least one {prefix} research weight must be positive.")
    return weights


def _research_parameter(
    name: str,
    default: float,
    minimum: float = 0,
    maximum: float | None = None,
) -> float:
    configured = _configured_parameter(name, minimum, maximum)
    return default if configured is None else configured


def temporal_risk(
    incidents: Iterable[Mapping[str, Any]],
    now: datetime,
    decay_per_second: float,
) -> float | None:
    """Compute repetition and recency risk from stored incident/targeting scores."""
    if not math.isfinite(decay_per_second) or decay_per_second <= 0:
        raise ValueError("decay_per_second must be finite and positive.")
    history = list(incidents)
    if not history:
        return None

    now_seconds = now.timestamp()
    accumulated_risk = 0.0
    for item in history:
        targeting = item.get("targeting_evidence", {})
        targeting_score = item.get("targeting_score")
        if targeting_score is None and isinstance(targeting, Mapping):
            targeting_score = targeting.get("score")
        occurred_at = _timestamp_seconds(item.get("timestamp"))
        if (
            item.get("incident_score") is None
            or targeting_score is None
            or occurred_at is None
        ):
            return None
        incident_score = _bounded_value("incident_score", float(item["incident_score"]))
        targeting_score = _bounded_value("targeting_score", float(targeting_score))
        elapsed = max(0.0, now_seconds - occurred_at)
        accumulated_risk += incident_score * targeting_score * math.exp(
            -decay_per_second * elapsed
        )
    return 1.0 - math.exp(-accumulated_risk)


def escalation_score(
    current_severity: float | None,
    previous_severities: Iterable[float],
    alpha: float,
) -> float | None:
    if not math.isfinite(alpha) or not 0 < alpha <= 1:
        raise ValueError("alpha must be finite and in the interval (0, 1].")
    if current_severity is None:
        return None
    current = _bounded_value("current_severity", current_severity)
    history = [_bounded_value("previous_severity", value) for value in previous_severities]
    if not history:
        return None
    ema = history[0]
    for severity in history[1:]:
        ema = alpha * severity + (1 - alpha) * ema
    return max(0.0, current - ema)


def _temporal_component(
    incidents: list[Mapping[str, Any]],
    now: datetime,
) -> dict[str, Any]:
    if not incidents:
        return {
            "value": None,
            "status": "no_history",
            "observed_incident_count": 0,
            "lambda_per_second": None,
            "formula": "logarithmic_dated_frequency_recency_and_time_span",
        }
    dated_timestamps = [
        timestamp
        for incident in incidents
        if (timestamp := _timestamp_seconds(incident.get("timestamp"))) is not None
    ]
    if not dated_timestamps:
        return {
            "value": None,
            "status": "timestamps_unavailable",
            "observed_incident_count": len(incidents),
            "dated_incident_count": 0,
            "lambda_per_second": None,
            "formula": "logarithmic_dated_frequency_recency_and_time_span",
        }
    frequency_reference = _research_parameter(
        "CHILDSAFELENS_TEMPORAL_REFERENCE_COUNT", 20, minimum=1
    )
    frequency = min(
        math.log1p(len(dated_timestamps)) / math.log1p(frequency_reference),
        1.0,
    )
    decay = _research_parameter(
        "CHILDSAFELENS_TEMPORAL_DECAY_PER_SECOND",
        math.log(2) / (7 * 24 * 60 * 60),
        minimum=0.000000000001,
    )
    span_reference_days = _research_parameter(
        "CHILDSAFELENS_TEMPORAL_SPAN_REFERENCE_DAYS", 30, minimum=0.000001
    )
    time_span_seconds = max(dated_timestamps) - min(dated_timestamps)
    time_span = min(
        time_span_seconds / (span_reference_days * 24 * 60 * 60),
        1.0,
    )
    frequency_weight = _research_parameter(
        "CHILDSAFELENS_TEMPORAL_FREQUENCY_WEIGHT", 0.55, minimum=0, maximum=1
    )
    recency_weight = _research_parameter(
        "CHILDSAFELENS_TEMPORAL_RECENCY_WEIGHT", 0.30, minimum=0, maximum=1
    )
    time_span_weight = _research_parameter(
        "CHILDSAFELENS_TEMPORAL_SPAN_WEIGHT", 0.15, minimum=0, maximum=1
    )
    if frequency_weight + recency_weight + time_span_weight <= 0:
        raise ValueError("Temporal component weights cannot all be zero.")
    recency = (
        math.exp(-decay * max(0.0, now.timestamp() - max(dated_timestamps)))
        if dated_timestamps else None
    )
    components = {
        "frequency": frequency,
        "recency": recency,
        "time_span": time_span,
    }
    available_weights = {
        name: weight
        for name, weight in {
            "frequency": frequency_weight,
            "recency": recency_weight,
            "time_span": time_span_weight,
        }.items()
        if weight > 0 and components[name] is not None
    }
    normalized_weights = _normalized_weights(available_weights, available_weights)
    value = sum(
        normalized_weights[name] * float(components[name])
        for name in available_weights
    )
    return {
        "value": value,
        "status": "computed",
        "observed_incident_count": len(incidents),
        "dated_incident_count": len(dated_timestamps),
        "lambda_per_second": decay,
        "frequency": frequency,
        "recency": recency,
        "time_span": time_span,
        "time_span_days": time_span_seconds / (24 * 60 * 60),
        "span_reference_days": span_reference_days,
        "weights": normalized_weights,
        "missing_components": [],
        "formula": "weighted_logarithmic_dated_frequency_recency_and_time_span",
    }


def _severity_category(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    normalized = re.sub(r"[^a-z]+", "_", value.strip().lower()).strip("_")
    if normalized == "physical_harm_indication":
        normalized = "physical_harm"
    return normalized if normalized in SEVERITY_CATEGORIES else None


def _severity_categories(values: Iterable[Any]) -> set[str]:
    return {
        category
        for value in values
        if (category := _severity_category(value)) is not None
    }


def _incident_severity_score(incident: Mapping[str, Any]) -> float | None:
    evidence = incident.get("severity_evidence")
    evidence = evidence if isinstance(evidence, Mapping) else {}
    indicators = evidence.get("indicators")
    observed = _severity_categories(indicators if isinstance(indicators, (list, tuple)) else [])
    observed_categories = [incident.get("category")]
    classifier_output = incident.get("classifierOutput")
    if isinstance(classifier_output, Mapping):
        output = classifier_output.get("output")
        if isinstance(output, Mapping):
            observed_categories.append(output.get("category"))
            categories = output.get("categories")
            if isinstance(categories, list):
                observed_categories.extend(
                    item.get("name") if isinstance(item, Mapping) else item
                    for item in categories
                )
    observed.update(_severity_categories(observed_categories))
    weights = _research_weights("severity", SEVERITY_RESEARCH_WEIGHTS)
    message_analysis = incident.get("messageAnalysis")
    if isinstance(message_analysis, Mapping):
        message_category = _severity_category(message_analysis.get("category"))
        if message_category is not None:
            return weights[message_category]
    classifier_output = incident.get("classifierOutput")
    if isinstance(classifier_output, Mapping):
        output = classifier_output.get("output")
        if isinstance(output, Mapping):
            output_category = _severity_category(output.get("category"))
            if output_category is not None:
                return weights[output_category]
    primary_category = _severity_category(incident.get("category"))
    if primary_category is not None:
        return weights[primary_category]
    if observed:
        return sum(weights[name] for name in observed) / len(observed)
    if evidence.get("analysis_status") == "completed":
        return 0.0

    value = evidence.get("score")
    if (
        isinstance(value, (int, float))
        and not isinstance(value, bool)
        and math.isfinite(value)
        and 0 <= value <= 1
    ):
        return float(value)
    return None


def _escalation_component(
    incidents: list[Mapping[str, Any]],
) -> dict[str, Any]:
    undated_severities = []
    for incident in incidents:
        severity = _incident_severity_score(incident)
        if (
            severity is not None
            and _timestamp_seconds(incident.get("timestamp")) is None
        ):
            undated_severities.append(severity)
    if not incidents:
        return {
            "value": None,
            "status": "no_history",
            "observed_severity_count": 0,
            "alpha": None,
        }

    dated = [
        (occurred_at, incident)
        for incident in incidents
        if (occurred_at := _timestamp_seconds(incident.get("timestamp"))) is not None
    ]
    dated.sort(key=lambda item: item[0])
    observations = [
        (timestamp, score)
        for timestamp, incident in dated
        if (score := _incident_severity_score(incident)) is not None
    ]
    if not observations:
        if undated_severities:
            return {
                "value": 0.0,
                "status": "computed",
                "observed_severity_count": len(undated_severities),
                "reason": (
                    "Severity evidence exists, but timestamps are unavailable to "
                    "establish an increasing trend; neutral score used."
                ),
                "alpha": None,
            }
        return {
            "value": None,
            "status": "severity_history_unavailable",
            "observed_severity_count": 0,
            "reason": "No stored incident has valid severity evidence.",
            "alpha": None,
        }
    alpha = _research_parameter(
        "CHILDSAFELENS_ESCALATION_ALPHA", 0.5, minimum=0.000001, maximum=1
    )
    ema = observations[0][1]
    previous_ema = ema
    for _, severity in observations[1:]:
        previous_ema = ema
        ema = alpha * severity + (1 - alpha) * ema
    score = max(0.0, ema - previous_ema) if len(observations) > 1 else 0.0
    return {
        "value": score,
        "status": "computed",
        "observed_severity_count": len(observations),
        "current_severity": observations[-1][1],
        "recent_ema": ema,
        "previous_ema": previous_ema if len(observations) > 1 else None,
        "alpha": alpha,
        "reason": (
            "Increasing severity trend observed in available incident history."
            if score > 0
            else "No increasing severity trend observed in available incident history."
        ),
        "formula": "positive_increase_between_recent_and_previous_severity_ema",
    }


def _historical_component(
    incidents: list[Mapping[str, Any]],
    current_temporal: Mapping[str, Any],
    now: datetime,
) -> dict[str, Any]:
    if not incidents:
        return {
            "value": None,
            "status": "no_history",
            "observed_incident_count": 0,
            "features": {},
        }

    reference_count = _research_parameter(
        "CHILDSAFELENS_TEMPORAL_REFERENCE_COUNT", 7, minimum=0.000001
    )
    severity_values = [
        value
        for incident in incidents
        if (value := _incident_severity_score(incident)) is not None
    ]
    classifier_values = [
        value
        for incident in incidents
        if (value := stored_classifier_probability(incident)) is not None
    ]
    timestamps = [
        timestamp
        for incident in incidents
        if (timestamp := _timestamp_seconds(incident.get("timestamp"))) is not None
    ]
    decay = current_temporal.get("lambda_per_second")
    recency = (
        math.exp(-float(decay) * max(0.0, now.timestamp() - max(timestamps)))
        if timestamps and isinstance(decay, (int, float))
        else None
    )
    values: dict[str, float | None] = {
        "frequency": min(len(incidents) / reference_count, 1.0),
        "recency": recency,
        "severity": sum(severity_values) / len(severity_values) if severity_values else None,
        "classifier_confidence": (
            sum(classifier_values) / len(classifier_values)
            if classifier_values
            else None
        ),
    }
    weights = _research_weights(
        "historical",
        {
            "frequency": 0.25,
            "recency": 0.25,
            "severity": 0.25,
            "classifier_confidence": 0.25,
        },
    )
    available = {name: value for name, value in values.items() if value is not None}
    normalized_weights = _normalized_weights(
        {name: weights[name] for name in available},
        available,
    )
    historical_value = sum(
        normalized_weights[name] * float(value)
        for name, value in available.items()
    )
    return {
        "value": historical_value,
        "status": "computed",
        "observed_incident_count": len(incidents),
        "features": values,
        "weights": normalized_weights,
        "missing_components": [name for name, value in values.items() if value is None],
        "formula": "weighted_available_historical_frequency_recency_severity_classifier",
    }


def historical_risk(
    current_temporal_risk: float | None,
    previous_risks: Iterable[float],
    retention: float,
) -> float | None:
    if not math.isfinite(retention) or not 0 <= retention < 1:
        raise ValueError("retention must be finite and in the interval [0, 1).")
    if current_temporal_risk is None:
        return None
    current = _bounded_value("current_temporal_risk", current_temporal_risk)
    history = [_bounded_value("previous_risk", value) for value in previous_risks]
    if not history:
        return current
    return retention * history[-1] + (1 - retention) * current


def risk_state(crs: float | None) -> str:
    if crs is None:
        return "Not available"
    score = float(crs)
    if not math.isfinite(score) or not 0 <= score <= 100:
        raise ValueError("CRS must be a finite number between 0 and 100.")
    warning = float(os.environ.get("CHILDSAFELENS_WARNING_THRESHOLD", "25"))
    high = float(os.environ.get("CHILDSAFELENS_HIGH_THRESHOLD", "50"))
    critical = float(os.environ.get("CHILDSAFELENS_CRITICAL_THRESHOLD", "75"))
    if not 0 <= warning < high < critical <= 100:
        raise ValueError("Risk thresholds must satisfy 0 <= warning < high < critical <= 100.")
    if score < warning:
        return "SAFE"
    if score < high:
        return "WARNING"
    if score < critical:
        return "HIGH"
    return "CRITICAL"


def social_graph(
    incidents: Iterable[Mapping[str, Any]],
    child_id: str | None,
    weights: Mapping[str, float] | None = None,
) -> dict[str, Any]:
    records = [
        incident
        for incident in incidents
        if child_id is None
        or incident.get("childId", incident.get("child_id")) == child_id
    ]
    graph = nx.MultiDiGraph()
    sender_counts: Counter[str] = Counter()
    identified_senders: set[str] = set()
    actors: set[str] = set()
    interaction_count = 0
    incoming_interaction_count = 0
    known_incoming_count = 0
    known_sender_interaction_count = 0
    identity_fields = (
        "senderId", "sender_id", "senderUsername", "sender_username",
        "authorId", "author_id", "author", "sender",
    )
    recipient_fields = (
        "receiverId", "receiver_id", "recipientId", "recipient_id",
        "receiverUsername", "recipientUsername", "receiver", "recipient",
    )

    def participant_identity(incident: Mapping[str, Any], field_names: tuple[str, ...]) -> str | None:
        for field_name in field_names:
            value = incident.get(field_name)
            if isinstance(value, Mapping):
                value = next(
                    (
                        value.get(key)
                        for key in ("id", "userId", "user_id", "username", "handle")
                        if isinstance(value.get(key), str) and value[key].strip()
                    ),
                    None,
                )
            if isinstance(value, str) and value.strip():
                return value.strip()
        return None

    for incident in records:
        child = incident.get("childId", incident.get("child_id"))
        if not isinstance(child, str) or not child.strip():
            continue
        child = child.strip()
        direction = str(
            incident.get("type", incident.get("direction", incident.get("messageType", "")))
        ).strip().upper()
        sender = participant_identity(incident, identity_fields)
        recipient = participant_identity(incident, recipient_fields)
        if direction not in {"INCOMING", "OUTGOING"}:
            direction = "INCOMING" if sender else "OUTGOING" if recipient else ""
        if not direction:
            continue
        interaction_count += 1
        incident_id = incident.get("incidentId", incident.get("incident_id"))
        if direction == "INCOMING":
            incoming_interaction_count += 1
        if sender:
            known_sender_interaction_count += 1
            identified_senders.add(sender)
            sender_counts[sender] += 1
            actors.add(sender)
        if direction == "INCOMING" and sender:
            known_incoming_count += 1
            graph.add_edge(
                sender, child, child_id=child, incident_id=incident_id,
                direction="INCOMING",
            )
        elif direction == "OUTGOING" and recipient:
            actors.add(recipient)
            graph.add_edge(
                child, recipient, child_id=child, incident_id=incident_id,
                direction="OUTGOING",
            )
        elif direction == "OUTGOING" and sender:
            graph.add_edge(
                child, sender, child_id=child, incident_id=incident_id,
                direction="OUTGOING",
            )

    sender_identity_available = any(
        field_name in incident
        for incident in records
        for field_name in identity_fields
    )
    complete_interaction_data = (
        interaction_count > 0
        and known_sender_interaction_count == interaction_count
    )
    concentration = (
        max(sender_counts.values()) / interaction_count
        if sender_counts and interaction_count
        else None
    )
    features: dict[str, float | int | None] = {
        "attackers": len(identified_senders) if identified_senders else None,
        "concentration": concentration,
        "frequency": interaction_count,
    }
    reference_count = _research_parameter(
        "CHILDSAFELENS_GRAPH_REFERENCE_COUNT", 20, minimum=1
    )
    scoring_features: dict[str, float | None] = {
        "attackers": (
            min(math.log1p(len(identified_senders)) / math.log1p(reference_count), 1.0)
            if identified_senders else None
        ),
        "concentration": concentration,
        "frequency": (
            min(math.log1p(interaction_count) / math.log1p(reference_count), 1.0)
            if interaction_count else None
        ),
    }
    effective_weights = weights or _research_weights(
        "graph",
        {"attackers": 0.30, "concentration": 0.40, "frequency": 0.30},
    )
    available_features = {
        name: value
        for name, value in scoring_features.items()
        if value is not None
    }
    selected_weights = {
        name: effective_weights[name]
        for name in available_features
        if name in effective_weights
    }
    normalized_weights = (
        _normalized_weights(selected_weights, selected_weights)
        if available_features and len(selected_weights) == len(available_features)
        else None
    )
    graph_score = None
    score_status = "insufficient_interaction_data"
    if not records:
        score_status = "no_history"
    elif interaction_count and normalized_weights is None:
        score_status = "weights_not_configured"
    elif interaction_count and normalized_weights is not None:
        graph_score = sum(
            normalized_weights[name] * float(scoring_features[name])
            for name in normalized_weights
        )
        score_status = (
            "computed_from_observed_relationships"
            if identified_senders
            else "computed_from_observed_interactions"
        )

    pseudonyms = {
        sender: hmac.new(
            _GRAPH_PSEUDONYM_KEY, sender.encode("utf-8"), hashlib.sha256
        ).hexdigest()[:12]
        for sender in actors
    }
    edges = [
        {
            "source": pseudonyms.get(source, source),
            "target": pseudonyms.get(target, target),
            "incident_id": data.get("incident_id"),
            "direction": data.get("direction"),
        }
        for source, target, data in graph.edges(data=True)
    ]
    child_nodes = sorted({
        incident.get("childId", incident.get("child_id"))
        for incident in records
        if isinstance(incident.get("childId", incident.get("child_id")), str)
    })
    identity_status = (
        "available"
        if identified_senders
        else "no_sender_identifiers_recorded"
        if sender_identity_available
        else "sender_identity_fields_unavailable"
    )
    graph_status = (
        "no_history"
        if not records
        else "available"
        if complete_interaction_data
        else "partial_observed_relationships"
        if graph.number_of_edges()
        else "observed_interactions_without_participant_ids"
        if interaction_count
        else "insufficient_interaction_data"
    )
    return {
        "status": graph_status,
        "interaction_count": interaction_count,
        "observed_interactions": interaction_count,
        "identified_attackers": sorted(identified_senders),
        "attacker_identity_status": identity_status,
        "attacker_count": len(identified_senders),
        "observed_attacker_count": len(identified_senders),
        "repeated_attacker_count": (
            sum(count > 1 for count in sender_counts.values())
        ),
        "incident_concentration": concentration,
        "sender_concentration": concentration,
        "incoming_interaction_count": incoming_interaction_count,
        "known_incoming_sender_interaction_count": known_incoming_count,
        "features": {
            "attackers": {
                "value": features["attackers"],
                "observed_value": len(identified_senders),
                "status": (
                    "computed"
                    if identified_senders
                    else identity_status
                ),
            },
            "concentration": {
                "value": concentration,
                "status": (
                    "computed_from_observed_relationships"
                    if concentration is not None and complete_interaction_data
                    else "computed_from_observed_relationships"
                    if concentration is not None
                    else "insufficient_sender_identity_data"
                    if incoming_interaction_count
                    else "no_incoming_interactions"
                ),
            },
            "frequency": {
                "value": features["frequency"] if interaction_count else 0,
                "observed_value": features["frequency"],
                "status": (
                    "computed"
                    if interaction_count
                    else "no_history"
                ),
            },
        },
        "normalized_features": scoring_features,
        "graph_score": graph_score,
        "graph_score_status": score_status,
        "graph_score_weights": normalized_weights,
        "graph_score_weight_status": (
            "configured_development_parameters"
            if normalized_weights is not None
            else "not_configured"
        ),
        "risk_score": graph_score,
        "risk_score_status": score_status,
        "nodes": [
            {"id": pseudonym, "role": "sender"}
            for actor, pseudonym in pseudonyms.items()
            if actor in identified_senders
        ] + [{"id": target, "role": "child"} for target in child_nodes],
        "edges": edges,
    }


def deterministic_risk_fusion(
    components: Mapping[str, float | None],
) -> dict[str, Any]:
    weights = _research_weights("fusion", FUSION_RESEARCH_WEIGHTS)
    available = {
        name: _bounded_value(name, float(components[name]))
        for name in FUSION_FEATURES
        if components.get(name) is not None
    }
    selected_weights = {name: weights[name] for name in available}
    normalized_weights = (
        _normalized_weights(selected_weights, selected_weights)
        if selected_weights and sum(selected_weights.values()) > 0
        else None
    )
    weighted_sum = sum(weights[name] * value for name, value in available.items())
    available_weight = sum(selected_weights.values())
    raw_score = weighted_sum / available_weight if available_weight > 0 else None
    contribution_share = {
        name: (weights[name] * value / weighted_sum if weighted_sum else 0.0)
        for name, value in available.items()
    }
    return {
        "score": round(raw_score * 100) if raw_score is not None else None,
        "raw_score": raw_score,
        "status": "computed" if raw_score is not None else "insufficient_evidence",
        "method": "research_derived_deterministic",
        "validated": False,
        "available_features": list(available),
        "missing_features": [
            name for name in FUSION_FEATURES if name not in available
        ],
        "configured_weights": weights,
        "renormalized_weights": normalized_weights,
        "feature_contributions": [
            {
                "feature": name,
                "value": value,
                "configured_weight": weights[name],
                "renormalized_weight": (
                    normalized_weights[name] if normalized_weights else None
                ),
                "contribution": contribution_share[name],
                "contribution_percent": contribution_share[name] * 100,
                "weighted_crs_points": (
                    100 * normalized_weights[name] * value
                    if normalized_weights
                    else None
                ),
            }
            for name, value in available.items()
        ],
        "contribution_status": (
            "zero_risk" if weighted_sum == 0 else "computed"
        ),
        "formula": (
            "round(100 * sum(available_weight * feature) / "
            "sum(available_weight))"
        ),
        "disclaimer": (
            "Research-derived deterministic risk score; not clinically or "
            "scientifically validated."
        ),
    }


def capability_status() -> dict[str, Any]:
    classifier = classifier_status()
    severity_weights = _research_weights("severity", SEVERITY_RESEARCH_WEIGHTS)
    incident_weights = configured_weights(
        "incident", ("classifier", "targeting", "severity", "multimodal")
    )
    graph_weights = _research_weights(
        "graph",
        {"attackers": 0.30, "concentration": 0.40, "frequency": 0.30},
    )
    return {
        "classifier": classifier,
        "classification_disclaimer": (
            "DEVELOPMENT/SIMULATION ONLY - classifier outputs are not research results."
            if classifier.get("status") == "dummy"
            else None
        ),
        "category_classifier": {
            "name": classifier.get("name", "Cyberbullying category classifier"),
            "status": (
                "available"
                if classifier.get("status") == "real" and classifier.get("categories")
                else "not_configured"
            ),
            "artifact_present": bool(
                classifier.get("artifact_present") and classifier.get("categories")
            ),
            "categories": classifier.get("categories", []),
        },
        "risk_fusion": risk_fusion_service.status(),
        "deterministic_risk_fusion": {
            "status": "available",
            "method": "research_derived_deterministic",
            "validated": False,
            "weights": _research_weights("fusion", FUSION_RESEARCH_WEIGHTS),
        },
        "explainability": risk_fusion_service.explainability_status(),
        "multimodal": {
            "audio": {
                "provider": "Sarvam",
                "status": "not_implemented",
                "credentials_configured": bool(os.environ.get("SARVAM_API_KEY")),
            },
            "image": {
                "provider": "thinkingmachines/Inkling",
                "status": "not_implemented",
                "credentials_configured": bool(os.environ.get("INKLING_API_KEY")),
                "endpoint_configured": bool(os.environ.get("INKLING_API_URL")),
            },
            "video": {"status": "not_implemented"},
        },
        "history_storage": "sqlite",
        "research_parameters": {
            "severity_weights_configured": severity_weights is not None,
            "incident_weights_configured": incident_weights is not None,
            "social_graph_weights_configured": graph_weights is not None,
            "temporal_decay_configured": True,
            "escalation_alpha_configured": True,
            "historical_retention_configured": True,
            "deterministic_fusion_weights_configured": True,
            "severity_weights": severity_weights,
            "fusion_weights": _research_weights("fusion", FUSION_RESEARCH_WEIGHTS),
            "risk_thresholds": {
                "warning": float(os.environ.get("CHILDSAFELENS_WARNING_THRESHOLD", "25")),
                "high": float(os.environ.get("CHILDSAFELENS_HIGH_THRESHOLD", "50")),
                "critical": float(os.environ.get("CHILDSAFELENS_CRITICAL_THRESHOLD", "75")),
            },
        },
        "message": (
            "Research-derived deterministic risk fusion uses available evidence and "
            "is not clinically or scientifically validated. SHAP is available only "
            "for an actual trained risk-fusion model."
        ),
    }


def _incident_datetime(value: Any) -> datetime | None:
    seconds = _timestamp_seconds(value)
    if seconds is None:
        return None
    try:
        return datetime.fromtimestamp(seconds, timezone.utc)
    except (OverflowError, OSError, ValueError):
        return None


def analytics_summary(
    incidents: Iterable[Mapping[str, Any]], now: datetime | None = None
) -> dict[str, Any]:
    records = list(incidents)
    current = now or datetime.now(timezone.utc)
    if current.tzinfo is None:
        current = current.replace(tzinfo=timezone.utc)
    current = current.astimezone(timezone.utc)
    start_date = current.date() - timedelta(days=6)
    daily_counts = {
        (start_date + timedelta(days=offset)).isoformat(): 0
        for offset in range(7)
    }
    risk_levels = Counter(str(item.get("riskLevel", "")).upper() for item in records)
    senders = Counter(
        item["senderId"].strip()
        for item in records
        if isinstance(item.get("senderId"), str) and item["senderId"].strip()
    )
    sender_data_available = bool(records) and all(
        isinstance(item.get("senderId"), str) and item["senderId"].strip()
        for item in records
    )

    for item in records:
        occurred_at = _incident_datetime(item.get("timestamp"))
        if occurred_at is not None:
            date_key = occurred_at.date().isoformat()
            if date_key in daily_counts:
                daily_counts[date_key] += 1

    high = sum(risk_levels[level] for level in ("HIGH", "CRITICAL", "HIGH_RISK"))
    medium = sum(risk_levels[level] for level in ("MEDIUM", "MEDIUM_RISK"))
    low = sum(risk_levels[level] for level in ("LOW", "LOW_RISK"))
    return {
        "total_incidents": len(records),
        "high_risk": high,
        "medium_risk": medium,
        "low_risk": low,
        "repeated_senders": (
            sum(count > 1 for count in senders.values())
            if sender_data_available
            else None
        ),
        "sender_data_available": sender_data_available,
        "daily_incidents": [
            {"date": date, "count": count} for date, count in daily_counts.items()
        ],
    }


def _observed_state_component(
    value: float | None,
    unavailable_status: str,
) -> dict[str, Any]:
    return {
        "value": value,
        "status": "computed" if value is not None else unavailable_status,
    }


def stored_classifier_probability(incident: Mapping[str, Any]) -> float | None:
    classifier_output = incident.get("classifierOutput")
    if not isinstance(classifier_output, Mapping):
        return None
    prediction = classifier_output.get("output")
    if not isinstance(prediction, Mapping):
        return None
    model_version = incident.get("modelVersion") or classifier_output.get(
        "modelVersion"
    )
    probability = prediction.get("probability")
    if (
        model_version != CASCADE_MODEL_VERSION
        or prediction.get("label") != "Bullying"
        or isinstance(probability, bool)
        or not isinstance(probability, (int, float))
        or not math.isfinite(probability)
        or not 0 <= probability <= 1
    ):
        return None
    return float(probability)


def _research_state(
    records: list[Mapping[str, Any]],
    temporal: Mapping[str, Any],
    escalation: Mapping[str, Any],
    graph: Mapping[str, Any],
    historical: Mapping[str, Any],
    classifier: Mapping[str, Any],
) -> dict[str, Any]:
    latest = max(
        records,
        key=lambda incident: (
            timestamp
            if (timestamp := _timestamp_seconds(incident.get("timestamp"))) is not None
            else float("-inf")
        ),
        default={},
    )
    targeting = latest.get("targeting_evidence")
    if not isinstance(targeting, Mapping):
        targeting = {}
    severity = latest.get("severity_evidence")
    if not isinstance(severity, Mapping):
        severity = {}
    multimodal = latest.get("multimodal_evidence")
    if not isinstance(multimodal, Mapping):
        multimodal = {}

    classifier_output = latest.get("classifierOutput", {})
    if not isinstance(classifier_output, Mapping):
        classifier_output = {}
    model_version = latest.get("modelVersion") or classifier_output.get(
        "modelVersion"
    )
    classifier_value = stored_classifier_probability(latest)
    if latest.get("model_status") == "dummy":
        classifier_value = None
        classifier_status = "dummy_development_simulation"
    elif classifier_value is None and classifier.get("status") == "dummy":
        classifier_status = "dummy_development_simulation"
    else:
        classifier_status = "no_classifier_signal"

    targeting_value = latest.get("targeting_score", targeting.get("score"))
    severity_value = severity.get("score")
    multimodal_value = latest.get("multimodal_score", multimodal.get("score"))
    values = {
        "P": _observed_state_component(classifier_value, classifier_status),
        "D": _observed_state_component(targeting_value, "targeting_score_unavailable"),
        "S": _observed_state_component(severity_value, "severity_score_unavailable"),
        "M": _observed_state_component(multimodal_value, "multimodal_score_unavailable"),
        "T": _observed_state_component(
            temporal.get("value"),
            str(temporal.get("status", "temporal_risk_unavailable")),
        ),
        "E": _observed_state_component(
            escalation.get("value"),
            str(escalation.get("status", "escalation_unavailable")),
        ),
        "G": _observed_state_component(
            graph.get("graph_score"),
            str(graph.get("graph_score_status", "social_graph_score_unavailable")),
        ),
        "H": _observed_state_component(
            historical.get("value"),
            str(historical.get("status", "historical_risk_unavailable")),
        ),
    }
    available_count = sum(component["value"] is not None for component in values.values())
    status = "computed" if available_count == len(values) else (
        "partially_available" if available_count else "insufficient_evidence"
    )
    return {
        "status": status,
        "component_order": ["P", "D", "S", "M", "T", "E", "G", "H"],
        "components": values,
        "vector": [values[name]["value"] for name in ("P", "D", "S", "M", "T", "E", "G", "H")],
    }


def _targeting_score_from_evidence(evidence: Mapping[str, Any]) -> float | None:
    stored_score = evidence.get("score")
    if (
        isinstance(stored_score, (int, float))
        and not isinstance(stored_score, bool)
        and math.isfinite(stored_score)
        and 0 <= stored_score <= 1
    ):
        return float(stored_score)
    indicators = evidence.get("indicators")
    available: dict[str, bool] = {}
    if isinstance(indicators, Mapping):
        available = {
            name: value
            for name, value in indicators.items()
            if name in TARGETING_FEATURES and isinstance(value, bool)
        }
    if not available:
        supporting = evidence.get("supporting_evidence")
        if isinstance(supporting, list):
            available = {
                name: True for name in supporting if name in TARGETING_FEATURES
            }
    if not available:
        return None
    weights = _research_weights("targeting", TARGETING_RESEARCH_WEIGHTS)
    normalized = _normalized_weights(
        {name: weights[name] for name in available},
        available,
    )
    return sum(normalized[name] * float(value) for name, value in available.items())


def _current_targeting_score(current_message: Mapping[str, Any]) -> float | None:
    score = current_message.get("targeting_score")
    if (
        isinstance(score, (int, float))
        and not isinstance(score, bool)
        and math.isfinite(score)
        and 0 <= score <= 1
    ):
        return float(score)
    signals = current_message.get("targeting_signals")
    if isinstance(signals, Mapping):
        evidence = {"indicators": signals}
    else:
        evidence = {
            "supporting_evidence": current_message.get("targeting_evidence", [])
        }
    score = _targeting_score_from_evidence(evidence)
    return score if score is not None else 0.0


def child_risk_assessment(
    incidents: Iterable[Mapping[str, Any]],
    child_id: str | None,
    now: datetime | None = None,
    current_message: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    records = list(incidents)
    current_time = now or datetime.now(timezone.utc)
    if current_time.tzinfo is None:
        current_time = current_time.replace(tzinfo=timezone.utc)
    current_time = current_time.astimezone(timezone.utc)
    history = analytics_summary(records, current_time)
    targeting_signals = [
        signal
        for incident in records
        for signal in incident.get("targeting_evidence", {}).get(
            "supporting_evidence", []
        )
    ]
    incidents_with_targeting_evidence = sum(
        bool(
            incident.get("targeting_evidence", {}).get(
                "supporting_evidence", []
            )
        )
        for incident in records
    )
    severity_signals = [
        indicator
        for incident in records
        for indicator in incident.get("severity_evidence", {}).get("indicators", [])
    ]
    capabilities = capability_status()
    dated_incident_count = sum(
        1 for incident in records
        if _incident_datetime(incident.get("timestamp")) is not None
    )
    active_day_count_last_7_days = sum(
        1 for day in history["daily_incidents"] if day["count"] > 0
    )
    all_time_incidents_by_day = Counter(
        occurred_at.date().isoformat()
        for incident in records
        if (occurred_at := _incident_datetime(incident.get("timestamp"))) is not None
    )
    active_day_count = len(all_time_incidents_by_day)
    latest_incident = max(
        records,
        key=lambda incident: (
            timestamp
            if (timestamp := _timestamp_seconds(incident.get("timestamp"))) is not None
            else float("-inf")
        ),
        default={},
    )
    current_analysis = (
        current_message
        if current_message
        and current_message.get("model_version") == CASCADE_MODEL_VERSION
        and current_message.get("text_status") == "available"
        else None
    )
    current_probability = (
        current_analysis.get("probability")
        if current_analysis is not None
        else None
    )
    if current_probability is not None:
        if (
            isinstance(current_probability, bool)
            or not isinstance(current_probability, (int, float))
            or not math.isfinite(current_probability)
            or not 0 <= current_probability <= 1
        ):
            raise ValueError("Current classifier probability must be between 0 and 1.")
        current_probability = float(current_probability)
    targeting_score = (
        _current_targeting_score(current_analysis)
        if current_analysis is not None
        else None
    )
    text_severity_evidence = (
        current_analysis.get("severity_evidence", [])
        if current_analysis is not None
        else []
    )
    if not isinstance(text_severity_evidence, list):
        text_severity_evidence = []
    current_categories: list[Any] = []
    if current_analysis is not None:
        current_categories.append(current_analysis.get("category"))
        categories = current_analysis.get("categories")
        if isinstance(categories, list):
            current_categories.extend(
                item.get("name") if isinstance(item, Mapping) else item
                for item in categories
            )
    severity_evidence = sorted(
        _severity_categories(text_severity_evidence)
        | _severity_categories(current_categories)
    )
    severity_score = None
    primary_severity_category = next(
        (
            category
            for value in current_categories
            if (category := _severity_category(value)) is not None
        ),
        None,
    )
    if primary_severity_category is not None:
        severity_weights = _research_weights(
            "severity", SEVERITY_RESEARCH_WEIGHTS
        )
        severity_score = severity_weights[primary_severity_category]
    elif severity_evidence:
        severity_weights = _research_weights(
            "severity", SEVERITY_RESEARCH_WEIGHTS
        )
        severity_score = sum(
            severity_weights[name] for name in severity_evidence
        ) / len(severity_evidence)
    if severity_score is not None:
        severity_score = _bounded_value("severity_score", float(severity_score))
    observed_targeting_evidence = (
        current_analysis.get("targeting_evidence", [])
        if current_analysis is not None
        else []
    )
    if not isinstance(observed_targeting_evidence, list):
        observed_targeting_evidence = []
    targeting_evidence = (
        observed_targeting_evidence if targeting_score is not None else []
    )
    latest_classifier_output = latest_incident.get("classifierOutput", {})
    if not isinstance(latest_classifier_output, Mapping):
        latest_classifier_output = {}
    latest_classifier_result = latest_classifier_output.get("output", {})
    if not isinstance(latest_classifier_result, Mapping):
        latest_classifier_result = {}
    latest_model_version = latest_incident.get("modelVersion") or (
        latest_classifier_output.get("modelVersion")
    )
    classifier_probability = (
        current_probability
        if current_analysis is not None and current_probability is not None
        else stored_classifier_probability(latest_incident)
    )
    current_text_available = current_analysis is not None
    classifier_is_dummy = (
        "dummy_development_simulation"
        if latest_incident.get("model_status") == "dummy"
        or (not latest_incident and capabilities["classifier"].get("status") == "dummy")
        else None
    )
    classifier_component_status = classifier_is_dummy or (
        "computed"
        if isinstance(classifier_probability, (int, float))
        else "not_available"
    )
    targeting_status = "computed" if targeting_score is not None else "insufficient_evidence"
    severity_status = "computed" if severity_score is not None else "insufficient_evidence"
    temporal_component = _temporal_component(records, current_time)
    escalation_component = _escalation_component(records)
    historical_component = _historical_component(
        records, temporal_component, current_time
    )
    historical_feature = historical_component
    graph = social_graph(
        records,
        child_id,
        weights=_research_weights(
            "graph",
            {"attackers": 0.30, "concentration": 0.40, "frequency": 0.30},
        ),
    )
    research_state = _research_state(
        records,
        temporal_component,
        escalation_component,
        graph,
        historical_component,
        capabilities["classifier"],
    )
    multimodal_score = None
    current_values = {
        "P": current_probability,
        "D": targeting_score,
        "S": severity_score,
        "M": multimodal_score,
        "T": temporal_component.get("value"),
        "E": escalation_component.get("value"),
        "G": graph.get("graph_score"),
        "H": historical_component.get("value"),
    }
    latest_incident = max(
        records,
        key=lambda incident: (
            timestamp
            if (timestamp := _timestamp_seconds(incident.get("timestamp"))) is not None
            else float("-inf")
        ),
        default={},
    )
    latest_targeting = latest_incident.get("targeting_evidence", {})
    if not isinstance(latest_targeting, Mapping):
        latest_targeting = {}
    latest_severity = latest_incident.get("severity_evidence", {})
    if not isinstance(latest_severity, Mapping):
        latest_severity = {}
    latest_targeting_evidence = latest_targeting.get("supporting_evidence", [])
    if not isinstance(latest_targeting_evidence, list):
        latest_targeting_evidence = []
    latest_severity_evidence = latest_severity.get("indicators", [])
    if not isinstance(latest_severity_evidence, list):
        latest_severity_evidence = []
    stored_message_analysis = latest_incident.get("messageAnalysis", {})
    if not isinstance(stored_message_analysis, Mapping):
        stored_message_analysis = {}
    latest_targeting_score = stored_message_analysis.get(
        "targeting_score", latest_incident.get("targeting_score")
    )
    if (
        isinstance(latest_targeting_score, bool)
        or not isinstance(latest_targeting_score, (int, float))
        or not math.isfinite(latest_targeting_score)
        or not 0 <= latest_targeting_score <= 1
    ):
        latest_targeting_score = None
    latest_severity_score = _incident_severity_score(latest_incident)
    if (
        not latest_severity_evidence
        and (latest_category := _severity_category(latest_incident.get("category")))
    ):
        latest_severity_evidence = [latest_category]
    risk_fusion_features = dict(current_values)
    risk_fusion_result = risk_fusion_service.predict(risk_fusion_features)
    risk_fusion_explanation = (
        risk_fusion_service.explain(risk_fusion_features)
        if risk_fusion_result["score"] is not None
        else {
            "status": "unavailable",
            "message": risk_fusion_result.get(
                "message", "Explanation unavailable"
            ),
            "missing_features": risk_fusion_result["missing_features"],
        }
    )
    deterministic_fusion = deterministic_risk_fusion(current_values)
    deterministic_feature_vector = [
        {"name": name, "value": current_values[name]}
        for name in FUSION_FEATURES
    ]
    model_crs = (
        round(risk_fusion_result["score"] * 100)
        if risk_fusion_result["score"] is not None
        else None
    )
    crs = (
        model_crs
        if model_crs is not None
        else deterministic_fusion["score"]
    )

    return {
        "child_id": child_id,
        "targeting_score": targeting_score,
        "targeting_evidence": targeting_evidence,
        "identified_attackers": graph["identified_attackers"],
        "identified_attacker_count": graph["attacker_count"],
        "observed_interactions": graph["interaction_count"],
        "sender_concentration": graph["sender_concentration"],
        "social_risk": graph["graph_score"],
        "incident_count": len(records),
        "history_metrics": {
            "dated_incident_count": dated_incident_count,
            "active_days": active_day_count,
            "total_incidents": len(records),
            "average_incidents_per_active_day": (
                len(records) / active_day_count if active_day_count else None
            ),
            "active_days_last_7_days": active_day_count_last_7_days,
            "incidents_last_7_days": sum(
                day["count"] for day in history["daily_incidents"]
            ),
            "repeated_senders": history["repeated_senders"],
            "sender_data_available": history["sender_data_available"],
        },
        "latest_incident": {
            "incident_id": latest_incident.get("incidentId"),
            "timestamp": latest_incident.get("timestamp"),
            "classification": latest_incident.get(
                "classification", latest_classifier_result.get("label")
            ),
            "category": latest_incident.get("category"),
            "classifier_probability": stored_classifier_probability(latest_incident),
            "model_version": latest_model_version,
            "targeting_evidence": latest_targeting_evidence,
            "severity_evidence": latest_severity_evidence,
            "targeting_score": latest_targeting_score,
            "severity_score": latest_severity_score,
            "text_status": (
                "available"
                if latest_incident.get("textEvidenceAvailable") is True
                else "not_provided"
            ),
            "content_type": latest_incident.get("contentType") or "text",
            "sender_id": latest_incident.get("senderId"),
            "source": "latest_stored_message",
        } if latest_incident else None,
        "current_message": {
            "classification": current_analysis.get("classification"),
            "category": current_analysis.get("category"),
            "classifier_probability": classifier_probability,
            "model_version": current_analysis.get("model_version"),
            "text_status": "available",
            "targeting_evidence": targeting_evidence,
            "targeting_score": targeting_score,
            "severity_evidence": severity_evidence,
            "severity_score": severity_score,
            "source": "current_message",
        } if current_analysis is not None else None,
        "text_evidence": {
            "status": "available" if current_text_available else "not_provided",
            "targeting": targeting_evidence,
            "severity": severity_evidence,
        },
        "multimodal_evidence": {
            "text": "available" if current_text_available else "not_provided",
            "image": "not_provided",
            "audio": "not_provided",
            "video": "not_provided",
        },
        "crs": crs,
        "risk_state": risk_state(crs),
        "risk_method": (
            "trained_risk_fusion_model"
            if model_crs is not None
            else "research_derived_deterministic"
            if crs is not None
            else "unavailable"
        ),
        "risk_disclaimer": deterministic_fusion["disclaimer"],
        "status": (
            "computed_model"
            if model_crs is not None
            else "computed_research_deterministic"
            if crs is not None
            else risk_fusion_result["status"]
        ),
        "risk_fusion": {
            **risk_fusion_result,
            "explanation": risk_fusion_explanation,
            "deterministic_research_fusion": deterministic_fusion,
        },
        "risk_fusion_model": risk_fusion_service.status(),
        "deterministic_feature_vector": deterministic_feature_vector,
        "deterministic_contributions": deterministic_fusion[
            "feature_contributions"
        ],
        "research_state": research_state,
        "targeting_evidence_count": len(targeting_signals),
        "targeting_incident_count": incidents_with_targeting_evidence,
        "targeting_cues_per_incident": (
            len(targeting_signals) / len(records) if records else None
        ),
        "severity_evidence_count": len(severity_signals),
        "social_graph": graph,
        "components": {
            "classifier_probability": {
                "value": classifier_probability,
                "status": classifier_component_status,
                "model_version": (
                    current_analysis.get("model_version")
                    if current_analysis is not None
                    else latest_model_version
                ),
                "scope": "message_level",
                "source": (
                    "current_message"
                    if current_analysis is not None
                    else "latest_stored_message"
                    if latest_incident
                    else "unavailable"
                ),
            },
            "targeting": {
                "value": targeting_score,
                "status": targeting_status,
                "observed_evidence_count": len(targeting_evidence),
                "evidence": targeting_evidence,
                "scope": (
                    "current_message"
                    if current_analysis is not None
                    else "unavailable"
                ),
            },
            "severity": {
                "value": severity_score,
                "status": severity_status,
                "observed_evidence_count": len(severity_evidence),
                "evidence": severity_evidence,
                "scope": (
                    "current_message"
                    if current_analysis is not None
                    else "unavailable"
                ),
            },
            "multimodal": {
                "value": multimodal_score,
                "status": "no_additional_multimodal_evidence"
                if current_text_available
                else "current_message_unavailable",
                **{
                    f"{modality}_status": status
                    for modality, status in {
                        "text": "available" if current_text_available else "not_provided",
                        "image": "not_provided",
                        "audio": "not_provided",
                        "video": "not_provided",
                    }.items()
                },
            },
            "temporal": {
                **temporal_component,
                "dated_incident_count": dated_incident_count,
                "active_day_count": active_day_count,
                "active_day_count_last_7_days": active_day_count_last_7_days,
                "average_incidents_per_active_day": (
                    len(records) / active_day_count if active_day_count else None
                ),
            },
            "escalation": escalation_component,
            "social_graph": {
                **research_state["components"]["G"],
                "observed_attacker_count": graph["attacker_count"],
            },
            "historical": {
                **historical_component,
                "observed_incident_count": len(records),
                "risk_score_status": "research_derived",
            },
        },
        "explanation": {
            "status": capabilities["explainability"]["status"],
            "contributors": None,
        },
        "classifier": capabilities["classifier"],
        "classification_disclaimer": capabilities["classification_disclaimer"],
        "message": capabilities["message"],
    }
