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
)
TARGETING_FEATURES = (*TARGETING_SIGNALS, "second_person_reference")
SOCIAL_GRAPH_FEATURES = ("attackers", "concentration", "frequency")
_GRAPH_PSEUDONYM_KEY = secrets.token_bytes(32)
_SECOND_PERSON_REFERENCE = re.compile(
    r"(?<!\w)(?:you|your|yours|yourself|yourselves)(?!\w)",
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

    indicators: dict[str, bool | None] = {
        "direct_mention": direct_mention,
        "child_name_reference": name_reference,
        "reply_to_child": reply_to_child,
        "personal_reference": personal_reference,
        "second_person_reference": bool(_SECOND_PERSON_REFERENCE.search(text)),
    }
    available = {
        name: value
        for name, value in indicators.items()
        if value is not None
    }
    supporting_evidence = [
        name for name, value in available.items() if value is True
    ]
    direct_targeting_evidence = any(
        indicators[name] is True
        for name in TARGETING_SIGNALS
    )
    normalized_weights = _normalized_weights(weights, available) if weights else None
    score = None
    if direct_targeting_evidence and normalized_weights is not None:
        score = sum(
            normalized_weights[name] * float(value)
            for name, value in available.items()
        )
    return {
        "status": "available" if direct_targeting_evidence else "insufficient_evidence",
        "analysis_status": "completed",
        "indicators": indicators,
        "available_signals": list(available),
        "supporting_evidence": supporting_evidence,
        "score": score,
        "score_status": (
            "computed_from_available_signals"
            if score is not None
            else "weights_not_configured"
            if direct_targeting_evidence
            else "insufficient_evidence_to_confirm_target"
        ),
    }


def severity_evidence(
    indicators: Iterable[str],
    weights: Mapping[str, float] | None = None,
    evidence_provided: bool | None = None,
    text: str | None = None,
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
    observed = sorted(
        {
            value
            for value in indicators
            if value in SEVERITY_CATEGORIES
        }
        | text_indicators
    )
    has_evidence_source = (
        evidence_provided is True
        or text is not None
        or bool(observed)
    )
    score = None
    if has_evidence_source and weights is not None:
        score = weighted_score(
            {
                category: float(category in observed)
                for category in SEVERITY_CATEGORIES
            },
            weights,
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
            )
            if available
        ],
        "score": score,
        "score_status": (
            "configured_uncalibrated_weights"
            if score is not None
            else "uncalibrated_weights"
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
        }
    decay = _configured_parameter(
        "CHILDSAFELENS_TEMPORAL_DECAY_PER_SECOND", minimum=0
    )
    if decay is None:
        return {
            "value": None,
            "status": "decay_parameter_not_configured",
            "observed_incident_count": len(incidents),
            "lambda_per_second": None,
        }
    if decay == 0:
        raise ValueError("CHILDSAFELENS_TEMPORAL_DECAY_PER_SECOND must be positive.")
    value = temporal_risk(incidents, now, decay)
    return {
        "value": value,
        "status": (
            "computed"
            if value is not None
            else "insufficient_incident_or_targeting_scores"
        ),
        "observed_incident_count": len(incidents),
        "lambda_per_second": decay,
        "formula": "repetition_plus_recency",
    }


def _stored_severity_score(incident: Mapping[str, Any]) -> float | None:
    evidence = incident.get("severity_evidence")
    if not isinstance(evidence, Mapping):
        return None
    value = evidence.get("score")
    if value is None:
        return None
    return _bounded_value("severity_score", float(value))


def _escalation_component(
    incidents: list[Mapping[str, Any]],
) -> dict[str, Any]:
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
    if not dated:
        return {
            "value": None,
            "status": "insufficient_dated_history",
            "observed_severity_count": 0,
            "alpha": None,
        }

    dated.sort(key=lambda item: item[0])
    current_timestamp, current_incident = dated[-1]
    current_severity = _stored_severity_score(current_incident)
    earlier_scores = [
        score
        for occurred_at, incident in dated[:-1]
        if occurred_at < current_timestamp
        if (score := _stored_severity_score(incident)) is not None
    ]
    if current_severity is None:
        return {
            "value": None,
            "status": "current_severity_unavailable",
            "observed_severity_count": len(earlier_scores),
            "alpha": None,
        }
    if not earlier_scores:
        return {
            "value": None,
            "status": "insufficient_severity_history",
            "observed_severity_count": 1,
            "current_severity": current_severity,
            "alpha": None,
        }

    alpha = _configured_parameter("CHILDSAFELENS_ESCALATION_ALPHA", 0, 1)
    if alpha is None or alpha == 0:
        if alpha == 0:
            raise ValueError("CHILDSAFELENS_ESCALATION_ALPHA must be greater than 0.")
        return {
            "value": None,
            "status": "alpha_not_configured",
            "observed_severity_count": len(earlier_scores) + 1,
            "current_severity": current_severity,
            "alpha": None,
        }

    return {
        "value": escalation_score(current_severity, earlier_scores, alpha),
        "status": "computed",
        "observed_severity_count": len(earlier_scores) + 1,
        "current_severity": current_severity,
        "alpha": alpha,
        "formula": "increase_over_previous_severity_ema",
    }


def _historical_component(
    incidents: list[Mapping[str, Any]],
    current_temporal: Mapping[str, Any],
) -> dict[str, Any]:
    if not incidents:
        return {
            "value": None,
            "status": "no_history",
            "observed_incident_count": 0,
            "eta": None,
            "previous_state": None,
        }

    eta = _configured_parameter("CHILDSAFELENS_HISTORICAL_RETENTION", 0, 1)
    if eta is None:
        return {
            "value": None,
            "status": "eta_not_configured",
            "observed_incident_count": len(incidents),
            "eta": None,
            "previous_state": None,
        }
    if eta == 1:
        raise ValueError("CHILDSAFELENS_HISTORICAL_RETENTION must be less than 1.")

    current_risk = current_temporal.get("value")
    if current_risk is None:
        return {
            "value": None,
            "status": "temporal_risk_unavailable",
            "observed_incident_count": len(incidents),
            "eta": eta,
            "previous_state": None,
        }

    decay = current_temporal.get("lambda_per_second")
    if decay is None:
        return {
            "value": None,
            "status": "decay_parameter_not_configured",
            "observed_incident_count": len(incidents),
            "eta": eta,
            "previous_state": None,
        }

    dated_records = [
        (timestamp, incident)
        for incident in incidents
        if (timestamp := _timestamp_seconds(incident.get("timestamp"))) is not None
    ]
    if len(dated_records) != len(incidents):
        return {
            "value": None,
            "status": "insufficient_dated_history",
            "observed_incident_count": len(incidents),
            "eta": eta,
            "previous_state": None,
        }
    dated_records.sort(key=lambda record: record[0])

    previous_state: float | None = None
    for index, (timestamp, _) in enumerate(dated_records[:-1]):
        point_in_time = datetime.fromtimestamp(timestamp, timezone.utc)
        temporal_at_event = temporal_risk(
            [incident for _, incident in dated_records[: index + 1]],
            point_in_time,
            float(decay),
        )
        if temporal_at_event is None:
            return {
                "value": None,
                "status": "previous_temporal_risk_unavailable",
                "observed_incident_count": len(incidents),
                "eta": eta,
                "previous_state": None,
            }
        previous_state = historical_risk(
            temporal_at_event,
            [previous_state] if previous_state is not None else [],
            eta,
        )

    historical_value = historical_risk(
        float(current_risk),
        [previous_state] if previous_state is not None else [],
        eta,
    )
    return {
        "value": historical_value,
        "status": "computed",
        "observed_incident_count": len(incidents),
        "eta": eta,
        "previous_state": previous_state,
        "current_temporal_risk": current_risk,
        "formula": "eta_previous_state_plus_one_minus_eta_temporal_risk",
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
        if child_id is None or incident.get("childId") == child_id
    ]
    graph = nx.MultiDiGraph()
    identified_senders: Counter[str] = Counter()

    for incident in records:
        sender = incident.get("senderId")
        target = incident.get("childId")
        if (
            isinstance(sender, str)
            and sender.strip()
            and isinstance(target, str)
            and target.strip()
        ):
            sender = sender.strip()
            target = target.strip()
            identified_senders[sender] += 1
            graph.add_edge(
                sender, target, child_id=target, incident_id=incident.get("incidentId")
            )

    complete_interaction_data = all(
        isinstance(item.get("senderId"), str)
        and item["senderId"].strip()
        and isinstance(item.get("childId"), str)
        and item["childId"].strip()
        for item in records
    )
    interaction_count = graph.number_of_edges()
    concentration = (
        max(identified_senders.values()) / interaction_count
        if interaction_count
        else None
    )
    features: dict[str, float | int | None] = {
        "attackers": len(identified_senders),
        "concentration": concentration,
        "frequency": interaction_count,
    }
    normalized_weights = _normalized_weights(weights, SOCIAL_GRAPH_FEATURES)
    graph_score = None
    score_status = "weights_not_configured"
    if records and not complete_interaction_data:
        score_status = "insufficient_interaction_data"
    elif not records:
        score_status = "no_history"
    elif normalized_weights is None:
        score_status = "weights_not_configured"
    elif any(value is None for value in features.values()):
        score_status = "insufficient_interaction_data"
    else:
        graph_score = sum(
            normalized_weights[name] * float(features[name])
            for name in SOCIAL_GRAPH_FEATURES
        )
        score_status = "computed_development_metric"

    pseudonyms = {
        sender: hmac.new(
            _GRAPH_PSEUDONYM_KEY, sender.encode("utf-8"), hashlib.sha256
        ).hexdigest()[:12]
        for sender in identified_senders
    }
    edges = [
        {
            "source": pseudonyms[source],
            "target": target,
            "incident_id": data.get("incident_id"),
        }
        for source, target, data in graph.edges(data=True)
        if source in pseudonyms
    ]
    child_nodes = sorted({target for _, target in graph.edges()})
    return {
        "status": (
            "no_history"
            if not records
            else (
                "available"
                if complete_interaction_data
                else "insufficient_interaction_data"
            )
        ),
        "interaction_count": interaction_count,
        "attacker_count": (
            len(identified_senders) if complete_interaction_data and records else None
        ),
        "observed_attacker_count": len(identified_senders),
        "repeated_attacker_count": (
            sum(count > 1 for count in identified_senders.values())
            if complete_interaction_data and records
            else None
        ),
        "incident_concentration": (
            concentration if complete_interaction_data and records else None
        ),
        "features": {
            "attackers": {
                "value": features["attackers"] if complete_interaction_data else None,
                "observed_value": features["attackers"],
                "status": (
                    "computed"
                    if complete_interaction_data and records
                    else ("no_history" if not records else "incomplete_interaction_data")
                ),
            },
            "concentration": {
                "value": concentration if complete_interaction_data else None,
                "status": (
                    "computed"
                    if complete_interaction_data and concentration is not None
                    else ("no_history" if not records else "incomplete_interaction_data")
                ),
            },
            "frequency": {
                "value": features["frequency"] if complete_interaction_data else None,
                "observed_value": features["frequency"],
                "status": (
                    "computed"
                    if complete_interaction_data and records
                    else ("no_history" if not records else "incomplete_interaction_data")
                ),
            },
        },
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
            for pseudonym in pseudonyms.values()
        ] + [{"id": target, "role": "child"} for target in child_nodes],
        "edges": edges,
    }


def capability_status() -> dict[str, Any]:
    classifier = classifier_status()
    severity_weights = configured_weights("severity", SEVERITY_CATEGORIES)
    incident_weights = configured_weights(
        "incident", ("classifier", "targeting", "severity", "multimodal")
    )
    graph_weights = configured_weights("graph", SOCIAL_GRAPH_FEATURES)
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
                else "unavailable"
            ),
            "artifact_present": bool(
                classifier.get("artifact_present") and classifier.get("categories")
            ),
            "categories": classifier.get("categories", []),
        },
        "risk_fusion": risk_fusion_service.status(),
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
            "temporal_decay_configured": os.environ.get(
                "CHILDSAFELENS_TEMPORAL_DECAY_PER_SECOND"
            ) is not None,
            "escalation_alpha_configured": os.environ.get(
                "CHILDSAFELENS_ESCALATION_ALPHA"
            ) is not None,
            "historical_retention_configured": os.environ.get(
                "CHILDSAFELENS_HISTORICAL_RETENTION"
            ) is not None,
        },
        "message": (
            "CRS and SHAP are not available until a validated child-risk training "
            "target and trained risk-fusion model are provided."
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

    classifier_value = latest.get("riskScore")
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
        "R": _observed_state_component(
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
        "component_order": ["P", "D", "S", "M", "R", "E", "G", "H"],
        "components": values,
        "vector": [values[name]["value"] for name in ("P", "D", "S", "M", "R", "E", "G", "H")],
    }


def child_risk_assessment(
    incidents: Iterable[Mapping[str, Any]],
    child_id: str | None,
    now: datetime | None = None,
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
    active_day_count = sum(
        1 for day in history["daily_incidents"] if day["count"] > 0
    )
    temporal_component = _temporal_component(records, current_time)
    escalation_component = _escalation_component(records)
    historical_component = _historical_component(records, temporal_component)
    graph = social_graph(
        records,
        child_id,
        weights=configured_weights("graph", SOCIAL_GRAPH_FEATURES),
    )
    research_state = _research_state(
        records,
        temporal_component,
        escalation_component,
        graph,
        historical_component,
        capabilities["classifier"],
    )
    latest_incident = max(
        records,
        key=lambda incident: (
            timestamp
            if (timestamp := _timestamp_seconds(incident.get("timestamp"))) is not None
            else float("-inf")
        ),
        default={},
    )
    risk_fusion_features = {
        "incident_score": latest_incident.get("incident_score"),
        "temporal_risk": temporal_component.get("value"),
        "escalation": escalation_component.get("value"),
        "social_graph": graph.get("graph_score"),
        "historical": historical_component.get("value"),
    }
    risk_fusion_result = risk_fusion_service.predict(risk_fusion_features)
    risk_fusion_explanation = (
        risk_fusion_service.explain(risk_fusion_features)
        if risk_fusion_result["score"] is not None
        else {
            "status": "unavailable",
            "message": "Explanation unavailable",
            "missing_features": risk_fusion_result["missing_features"],
        }
    )
    crs = (
        risk_fusion_result["score"] * 100
        if risk_fusion_result["score"] is not None
        else None
    )

    return {
        "child_id": child_id,
        "incident_count": len(records),
        "history_metrics": {
            "dated_incident_count": dated_incident_count,
            "active_days_last_7_days": active_day_count,
            "incidents_last_7_days": sum(
                day["count"] for day in history["daily_incidents"]
            ),
            "average_incidents_per_active_day": (
                sum(day["count"] for day in history["daily_incidents"])
                / active_day_count
                if active_day_count
                else None
            ),
            "repeated_senders": history["repeated_senders"],
            "sender_data_available": history["sender_data_available"],
        },
        "crs": crs,
        "risk_state": risk_state(crs),
        "status": (
            "computed"
            if crs is not None
            else risk_fusion_result["status"]
        ),
        "risk_fusion": {
            **risk_fusion_result,
            "explanation": risk_fusion_explanation,
            "features": risk_fusion_features,
        },
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
                **research_state["components"]["P"],
            },
            "targeting": {
                "value": None,
                "status": (
                    "evidence_observed_uncalibrated"
                    if targeting_signals
                    else "insufficient_context"
                ),
                "observed_evidence_count": len(targeting_signals),
                "observed_incident_count": incidents_with_targeting_evidence,
            },
            "severity": {
                "value": None,
                "status": "uncalibrated_weights",
                "observed_evidence_count": len(severity_signals),
            },
            "multimodal": {"value": None, "status": "provider_not_configured"},
            "temporal": {
                **temporal_component,
                "dated_incident_count": dated_incident_count,
                "active_day_count_last_7_days": active_day_count,
            },
            "escalation": escalation_component,
            "social_graph": {
                **research_state["components"]["G"],
                "observed_attacker_count": graph["attacker_count"],
            },
            "historical": {
                **historical_component,
                "observed_incident_count": len(records),
                "risk_score_status": historical_component["status"],
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
