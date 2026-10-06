"""
main.py — ChildSafeLens demo backend.

Provides endpoints for:
    - /predict: score a message for risk
    - /log-event: log a risk event
    - /events: aggregated counts
    - /incidents: manage pending parent approval incidents
    - /parent/incidents/{incidentId}/block
    - /parent/incidents/{incidentId}/edit
    - /parent/incidents/{incidentId}/allow
    - /child/pending-decisions
    - /child/messages/{messageId}/retry
    - /settings: parent default timeout policies
"""

import uuid
import os
import secrets
import base64
import hashlib
import hmac
import json
import logging
import math
import time
from datetime import datetime, timezone
from typing import Any, Literal

from fastapi import FastAPI, HTTPException, Header, Depends, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from model import predict_text
from classifier_service import CASCADE_MODEL_VERSION, ModelUnavailableError
from account_store import account_store
from notification_service import notification_service, NotificationPreferences
from research_risk import (
    INCIDENT_SCORE_COMPONENTS,
    SOCIAL_GRAPH_FEATURES,
    SEVERITY_CATEGORIES,
    TARGETING_FEATURES,
    analytics_summary,
    capability_status,
    child_risk_assessment,
    configured_weights,
    current_incident_score,
    severity_evidence,
    social_graph,
    stored_classifier_probability,
    targeting_evidence,
)

app = FastAPI(title="ChildSafeLens Demo API")
_logger = logging.getLogger(__name__)
_classification_debug = os.environ.get("CHILDSAFELENS_CLASSIFIER_DEBUG") == "1"

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        origin.strip()
        for origin in os.environ.get(
            "CHILDSAFELENS_ALLOWED_ORIGINS",
            "http://localhost:8081,http://127.0.0.1:8081,"
            "http://localhost:8082,http://127.0.0.1:8082",
        ).split(",")
        if origin.strip()
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)

_events = account_store.list_risk_events()
_incidents = {
    incident["incidentId"]: incident
    for incident in account_store.list_incidents()
}
_default_parent_settings = {
    "medium_risk_timeout_action": "ALLOW",
    "high_risk_timeout_action": "BLOCK",
    "critical_risk_timeout_action": "KEEP_PENDING",
    "timeout_seconds": 60
}
_parent_settings: dict[str, dict] = {}

RiskLevel = Literal["low_risk", "medium_risk", "high_risk"]


class PredictRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=2000)
    child_name: str | None = Field(default=None, max_length=120)
    child_username: str | None = Field(default=None, max_length=120)
    reply_to_child: bool | None = None
    personal_reference: bool | None = None


class ParentAuthRequest(BaseModel):
    email: str = Field(..., min_length=3, max_length=320)
    password: str = Field(..., min_length=1, max_length=256)
    fullName: str = Field(default="", max_length=120)


DEFAULT_DEV_AUTH_SECRET = "childsafelens-local-dev-auth-secret-32bytes"


def _auth_secret() -> bytes:
    secret = os.environ.get("CHILDSAFELENS_AUTH_SECRET")
    if secret is None:
        _logger.warning(
            "CHILDSAFELENS_AUTH_SECRET missing; using local development fallback. "
            "Set CHILDSAFELENS_AUTH_SECRET in production to a secure secret."
        )
        return DEFAULT_DEV_AUTH_SECRET.encode("utf-8")
    if len(secret.encode("utf-8")) >= 32:
        return secret.encode("utf-8")
    _logger.warning(
        "CHILDSAFELENS_AUTH_SECRET is too short; using local development fallback. "
        "Set CHILDSAFELENS_AUTH_SECRET in production to a secure secret."
    )
    return DEFAULT_DEV_AUTH_SECRET.encode("utf-8")


def _base64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _issue_access_token(email: str) -> dict[str, str | int]:
    now = int(time.time())
    try:
        lifetime = int(os.environ.get("CHILDSAFELENS_AUTH_TOKEN_TTL_SECONDS", "43200"))
    except ValueError as error:
        raise HTTPException(
            status_code=503,
            detail="Authentication token lifetime is misconfigured.",
        ) from error
    if not 60 <= lifetime <= 604800:
        raise HTTPException(
            status_code=503,
            detail="Authentication token lifetime is misconfigured.",
        )
    payload = _base64url(
        json.dumps(
            {"sub": account_store.normalize_email(email), "iat": now, "exp": now + lifetime},
            separators=(",", ":"),
        ).encode("utf-8")
    )
    signature = _base64url(
        hmac.new(_auth_secret(), payload.encode("ascii"), hashlib.sha256).digest()
    )
    return {
        "access_token": f"{payload}.{signature}",
        "token_type": "Bearer",
        "expires_at": now + lifetime,
    }


def require_parent(
    authorization: str | None = Header(default=None, alias="Authorization"),
) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="A valid bearer token is required.")
    try:
        payload, signature = authorization[7:].split(".", 1)
        expected = _base64url(
            hmac.new(_auth_secret(), payload.encode("ascii"), hashlib.sha256).digest()
        )
        if not hmac.compare_digest(signature, expected):
            raise ValueError("Invalid token signature.")
        decoded = base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4))
        claims = json.loads(decoded)
        email = claims["sub"]
        expires_at = claims["exp"]
        if (
            not isinstance(email, str)
            or not email
            or not isinstance(expires_at, int)
            or expires_at <= int(time.time())
            or not account_store.has_account(email)
        ):
            raise ValueError("Invalid or expired token.")
    except (KeyError, TypeError, ValueError, UnicodeDecodeError, json.JSONDecodeError) as error:
        raise HTTPException(status_code=401, detail="Invalid or expired bearer token.") from error
    return account_store.normalize_email(email)


def _assert_parent_scope(requested_email: str | None, authenticated_email: str) -> str:
    if requested_email and account_store.normalize_email(requested_email) != authenticated_email:
        raise HTTPException(status_code=403, detail="The requested parent account does not match the authenticated account.")
    return authenticated_email


def _require_incident_owner(incident_id: str, authenticated_email: str) -> dict:
    incident = _incidents.get(incident_id)
    if (
        incident is None
        or account_store.normalize_email(incident.get("parentEmail", ""))
        != authenticated_email
    ):
        raise HTTPException(status_code=404, detail="Incident not found")
    return incident


class ChildProfileRequest(BaseModel):
    parentEmail: str = Field(..., min_length=3, max_length=320)
    childName: str = Field(..., min_length=1, max_length=120)


class PredictResponse(BaseModel):
    classification: Literal["CLEAN", "CYBERBULLYING"] = "CLEAN"
    model_classification: Literal["Bullying", "Clean"] | None = None
    decision_override: str | None = None
    cyberbullying: bool = False
    p_bullying: float | None = None
    gate_threshold: float | None = None
    categories: list[dict[str, str | float]] = Field(default_factory=list)
    incident_created: bool = False
    classification_status: str = "MODEL_LOADED"
    risk_score: float
    text_evidence_available: bool = True
    targeting_evidence: dict[str, Any] = Field(default_factory=dict)
    severity_evidence: dict[str, Any] = Field(default_factory=dict)
    is_risky: bool
    label: RiskLevel
    stage1_label: Literal["Bullying", "Clean"] | None
    stage1_status: str
    classification_label: Literal["Bullying", "Clean"] | None
    classification_confidence: float | None
    model_status: Literal["dummy", "real", "model_not_configured"]
    model_version: str
    development_simulation: bool
    classification_notice: str
    category: str | None
    category_status: str
    stage: str
    model_name: str | None = None
    timestamp: str | None = None
    modality: str = "text"
    processing_status: str | None = None


class LogEventRequest(BaseModel):
    risk_level: RiskLevel
    timestamp: str | None = None
    model_status: Literal["dummy", "real"] | None = None
    model_version: str | None = None
    development_simulation: bool | None = None
    model_name: str | None = None
    modality: Literal["text", "image", "audio", "video"] = "text"
    processing_status: str | None = None


class IncidentCreate(BaseModel):
    incidentId: str
    parentEmail: str = "default_parent@test.com"
    childId: str = Field(..., min_length=1)
    childName: str = "Aarav"
    type: str
    messageSnippet: str
    messageText: str | None = Field(default=None, min_length=1, max_length=2000)
    riskScore: float
    riskLevel: str
    category: str
    packageName: str
    timestamp: int
    status: str = "PENDING_PARENT_REVIEW"
    senderId: str | None = None
    childUsername: str | None = None
    replyToChild: bool | None = None
    personalReference: bool | None = None
    severityIndicators: list[
        Literal["insult", "harassment", "humiliation", "threat", "blackmail", "physical_harm"]
    ] = Field(default_factory=list)
    contentType: Literal["text", "image", "audio", "video"] | None = None
    evidenceReference: str | None = Field(
        default=None,
        min_length=32,
        max_length=128,
        pattern=r"^[A-Za-z0-9_-]+$",
    )


class MediaAnalysisRequest(BaseModel):
    media_reference: str = Field(..., min_length=1, max_length=2048)


class DecisionRequest(BaseModel):
    decision: Literal["ALLOW", "BLOCK", "EDIT", "SHOW", "HIDE", "GUIDANCE"]
    guidance: str | None = None
    editedContent: str | None = None


class ParentSettings(BaseModel):
    medium_risk_timeout_action: str
    high_risk_timeout_action: str
    critical_risk_timeout_action: str
    timeout_seconds: int


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/auth/register", status_code=201)
def register_parent(req: ParentAuthRequest):
    _auth_secret()
    if "@" not in req.email:
        raise HTTPException(status_code=422, detail="A valid email is required.")
    if len(req.password) < 6:
        raise HTTPException(status_code=422, detail="Password must be at least 6 characters.")
    if not account_store.create_account(req.email, req.password, req.fullName):
        raise HTTPException(status_code=409, detail="An account with this email already exists.")
    return {
        "status": "ok",
        "email": account_store.normalize_email(req.email),
        **_issue_access_token(req.email),
    }


@app.post("/auth/login")
def login_parent(req: ParentAuthRequest):
    if not account_store.verify_credentials(req.email, req.password):
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    return {
        "status": "ok",
        "email": account_store.normalize_email(req.email),
        **_issue_access_token(req.email),
    }


@app.get("/children/profiles")
def get_child_profiles(
    parentEmail: str | None = None,
    authenticated_email: str = Depends(require_parent),
):
    owner_email = _assert_parent_scope(parentEmail, authenticated_email)
    return [
        {
            "childId": profile["child_id"],
            "parentEmail": profile["parent_email"],
            "childName": profile["child_name"],
        }
        for profile in account_store.list_child_profiles(owner_email)
    ]


@app.post("/children/profiles", status_code=201)
def create_child_profile(
    req: ChildProfileRequest,
    authenticated_email: str = Depends(require_parent),
):
    owner_email = _assert_parent_scope(req.parentEmail, authenticated_email)
    profile = account_store.add_child_profile(owner_email, req.childName)
    return {
        "childId": profile["child_id"],
        "parentEmail": profile["parent_email"],
        "childName": profile["child_name"],
    }


@app.post("/predict", response_model=PredictResponse)
def predict(req: PredictRequest):
    try:
        result = predict_text(req.text)
    except ModelUnavailableError as error:
        raise HTTPException(
            status_code=503,
            detail={
                "classification_status": "MODEL_UNAVAILABLE",
                "message": "The supplied cyberbullying model is unavailable.",
            },
        ) from error
    timestamp = datetime.now(timezone.utc).isoformat()
    classifier_info = capability_status()["classifier"]
    processing_status = (
        "completed"
        if result["model_status"] == "real"
        else "development_simulation"
        if result["model_status"] == "dummy"
        else "unavailable"
    )
    return PredictResponse(
        classification=result.get(
            "classification",
            "CYBERBULLYING" if result.get("is_risky") else "CLEAN",
        ),
        model_classification=result.get("model_classification", result.get("classification_label")),
        decision_override=result.get("decision_override"),
        cyberbullying=result.get("cyberbullying", result["is_risky"]),
        p_bullying=result.get("p_bullying", result["risk_score"]),
        gate_threshold=result.get("gate_threshold"),
        categories=result.get("categories", []),
        incident_created=False,
        risk_score=result["risk_score"],
        text_evidence_available=bool(req.text.strip()),
        targeting_evidence=targeting_evidence(
            req.text,
            child_name=req.child_name,
            child_username=req.child_username,
            reply_to_child=req.reply_to_child,
            personal_reference=req.personal_reference,
            weights=configured_weights("targeting", TARGETING_FEATURES),
        ),
        severity_evidence=severity_evidence(
            [],
            weights=configured_weights("severity", SEVERITY_CATEGORIES),
            text=req.text,
        ),
        is_risky=result["is_risky"],
        label=result["label"],
        stage1_label=result["stage1_label"],
        stage1_status=result["stage1_status"],
        classification_label=result["classification_label"],
        classification_confidence=result["classification_confidence"],
        model_status=result["model_status"],
        model_version=result["model_version"],
        development_simulation=result["development_simulation"],
        classification_notice=result["classification_notice"],
        category=result["category"],
        category_status=result["category_status"],
        stage=result["stage"],
        model_name=classifier_info.get("name"),
        timestamp=timestamp,
        modality="text",
        processing_status=processing_status,
    )


@app.post("/log-event")
def log_event(req: LogEventRequest):
    timestamp = req.timestamp or datetime.now(timezone.utc).isoformat()
    event_id = f"evt_{uuid.uuid4().hex[:8]}"
    event = {
            "event_id": event_id,
            "risk_level": req.risk_level,
            "timestamp": timestamp,
            "model_status": req.model_status,
            "model_version": req.model_version,
            "development_simulation": req.development_simulation,
            "model_name": req.model_name,
            "modality": req.modality,
            "processing_status": req.processing_status or req.model_status,
        }
    account_store.save_risk_event(event)
    _events.append(event)
    return {"status": "ok", "event_id": event_id}


def _save_incident(incident: dict) -> None:
    incident["parentAction"] = incident.get("parentDecision")
    try:
        account_store.save_incident(incident)
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    _incidents[incident["incidentId"]] = incident


def _persist_risk_snapshot(
    incidents: list[dict],
    assessment: dict,
    assessed_at: datetime | None = None,
) -> None:
    if not incidents:
        return
    latest = max(incidents, key=lambda item: int(item["timestamp"]))
    components = assessment["components"]
    risk_fusion = assessment["risk_fusion"]
    explanation = risk_fusion["explanation"]
    snapshot_time = (assessed_at or datetime.now(timezone.utc)).isoformat()
    snapshot = dict(latest)
    snapshot.update(
        {
            "temporalRisk": components["temporal"].get("value"),
            "escalationScore": components["escalation"].get("value"),
            "socialGraphRisk": assessment["social_graph"].get("graph_score"),
            "historicalRisk": components["historical"].get("value"),
            "CRS": assessment.get("crs"),
            "riskState": assessment.get("risk_state"),
            "riskAssessmentStatus": assessment.get("status"),
            "riskAssessmentTimestamp": snapshot_time,
            "riskFusionOutput": {
                "status": risk_fusion.get("status"),
                "value": (
                    risk_fusion.get("score")
                    if assessment.get("risk_method") == "trained_risk_fusion_model"
                    else assessment.get("crs", 0) / 100
                    if assessment.get("crs") is not None
                    else None
                ),
                "modelName": (
                    "XGBoost child-risk fusion"
                    if assessment.get("risk_method") == "trained_risk_fusion_model"
                    else "Research-derived deterministic risk fusion"
                ),
                "modelVersion": risk_fusion.get("model_version"),
                "method": assessment.get("risk_method"),
                "timestamp": snapshot_time,
                "modality": "contextual_risk",
                "processingStatus": assessment.get("status"),
            },
            "shapExplanation": {
                **explanation,
                "timestamp": snapshot_time,
                "modality": "contextual_risk",
                "modelVersion": risk_fusion.get("model_version"),
            },
            "modelVersions": {
                **snapshot.get("modelVersions", {}),
                **(
                    {"risk_fusion": risk_fusion.get("model_version")}
                    if assessment.get("risk_method") == "trained_risk_fusion_model"
                    else {}
                ),
            },
        }
    )
    _save_incident(snapshot)


@app.get("/events")
def get_events(
    parentEmail: str | None = None,
    childName: str | None = None,
    childId: str | None = None,
    authenticated_email: str = Depends(require_parent),
):
    owner_email = _assert_parent_scope(parentEmail, authenticated_email)
    if childName and not childId:
        raise HTTPException(
            status_code=422,
            detail="A selected childId is required for child-scoped event queries.",
        )
    incidents = (
        _child_incidents(owner_email, child_id=childId)
        if childId
        else _parent_incidents(owner_email)
    )

    high = sum(1 for i in incidents if str(i.get("riskLevel", "")).upper() in ["HIGH", "CRITICAL", "HIGH_RISK"])
    medium = sum(1 for i in incidents if str(i.get("riskLevel", "")).upper() in ["MEDIUM", "MEDIUM_RISK"])
    low = sum(1 for i in incidents if str(i.get("riskLevel", "")).upper() in ["LOW", "LOW_RISK"])
    return {"total_events": len(incidents), "high_risk_count": high, "medium_risk_count": medium, "low_risk_count": low}


@app.get("/analytics")
def get_analytics(
    childId: str = Query(..., min_length=1),
    parentEmail: str | None = None,
    authenticated_email: str = Depends(require_parent),
):
    owner_email = _assert_parent_scope(parentEmail, authenticated_email)
    incidents = _child_incidents(owner_email, child_id=childId)
    return analytics_summary(incidents)


@app.post("/incidents")
def create_incident(
    inc: IncidentCreate,
    authenticated_email: str = Depends(require_parent),
):
    owner_email = _assert_parent_scope(inc.parentEmail, authenticated_email)
    classification_text = inc.messageText or inc.messageSnippet
    try:
        prediction = predict_text(classification_text)
    except ModelUnavailableError as error:
        raise HTTPException(
            status_code=503,
            detail={
                "classification_status": "MODEL_UNAVAILABLE",
                "message": "The supplied cyberbullying model is unavailable.",
            },
        ) from error
    if (
        prediction["model_status"] != "real"
        or prediction["model_version"] != CASCADE_MODEL_VERSION
    ):
        raise HTTPException(
            status_code=503,
            detail="Incident verification requires the supplied cyberbullying cascade model.",
        )
    if prediction["classification_label"] != "Bullying":
        if _classification_debug:
            _logger.info(
                "Cascade incident decision model=%s p_bullying=%.6f "
                "gate_threshold=%.6f classification=CLEAN incident_created=false",
                prediction["model_version"],
                prediction["risk_score"],
                prediction.get("gate_threshold", 0.0),
            )
        raise HTTPException(
            status_code=422,
            detail="Message classified as Clean; incident was not created.",
        )

    canonical_child_id, canonical_child_name, _ = _resolve_child_identity(
        owner_email,
        child_id=inc.childId,
        child_name=inc.childName,
    )
    child_name = canonical_child_name or (
        inc.childName if "childName" in inc.model_fields_set else None
    )
    targeting = targeting_evidence(
        classification_text,
        child_name=child_name,
        child_username=inc.childUsername,
        reply_to_child=inc.replyToChild,
        personal_reference=inc.personalReference,
        weights=configured_weights("targeting", TARGETING_FEATURES),
    )
    severity = severity_evidence(
        inc.severityIndicators,
        weights=configured_weights("severity", SEVERITY_CATEGORIES),
        evidence_provided="severityIndicators" in inc.model_fields_set,
        text=classification_text,
    )
    incident_score = current_incident_score(
        classifier_probability=prediction.get("risk_score"),
        targeting_score=targeting.get("score"),
        severity_score=severity.get("score"),
        multimodal_score=None,
        weights=configured_weights("incident", INCIDENT_SCORE_COMPONENTS),
    )
    classification_timestamp = datetime.now(timezone.utc).isoformat()
    capabilities = capability_status()
    classifier_info = capabilities["classifier"]
    classifier_output = {
        "modelName": classifier_info.get("name", "Cyberbullying classifier"),
        "modelVersion": prediction.get("model_version"),
        "timestamp": classification_timestamp,
        "modality": "text",
        "sourceModality": inc.contentType or "text",
        "processingStatus": (
            "completed"
            if prediction.get("model_status") == "real"
            else "development_simulation"
            if prediction.get("model_status") == "dummy"
            else "unavailable"
        ),
        "output": {
            "label": prediction.get("classification_label"),
            "probability": prediction.get("risk_score"),
            "confidence": prediction.get("classification_confidence"),
            "category": prediction.get("category"),
            "categories": prediction.get("categories", []),
        },
    }
    media_modality = inc.contentType or "text"
    multimodal_status = (
        capabilities["multimodal"].get(media_modality, {}).get("status")
        if media_modality != "text"
        else "not_required"
    )
    ai_results = [classifier_output]
    if media_modality != "text":
        provider = capabilities["multimodal"].get(media_modality, {})
        ai_results.append(
            {
                "modelName": provider.get("provider"),
                "modelVersion": None,
                "timestamp": classification_timestamp,
                "modality": media_modality,
                "processingStatus": multimodal_status,
                "output": None,
            }
        )
    incident_data = {
        "incidentId": inc.incidentId,
        "parentEmail": owner_email,
        "childId": canonical_child_id or inc.childId,
        "childName": canonical_child_name or inc.childName,
        "classification": "CYBERBULLYING",
        "type": inc.type,
        "messageSnippet": inc.messageSnippet[:280],
        "textEvidenceAvailable": bool(classification_text.strip()),
        "riskScore": prediction["risk_score"],
        "riskLevel": prediction["label"],
        "category": prediction.get("category"),
        "packageName": inc.packageName,
        "timestamp": inc.timestamp,
        "status": "PENDING_PARENT_REVIEW",
        "parentDecision": None,
        "parentAction": None,
        "guidance": None,
        "editedContent": None,
        "senderId": inc.senderId,
        "contentType": inc.contentType,
        "evidenceReference": inc.evidenceReference,
        "classifierOutput": classifier_output,
        "aiResults": ai_results,
        "multimodalAnalysis": {
            "modelName": (
                capabilities["multimodal"].get(media_modality, {}).get("provider")
                if media_modality != "text"
                else None
            ),
            "modelVersion": None,
            "timestamp": classification_timestamp,
            "modality": media_modality,
            "processingStatus": multimodal_status,
            "evidenceReference": inc.evidenceReference,
            "score": None,
            "caption": None,
        },
        "targeting_evidence": targeting,
        "targetingScore": targeting.get("score"),
        "targeting_score": targeting.get("score"),
        "severity_evidence": severity,
        "severityScore": severity.get("score"),
        "multimodalScore": None,
        "incidentScore": incident_score["score"],
        "incident_score": incident_score["score"],
        "incident_score_status": incident_score["status"],
        "incident_score_components": incident_score["components"],
        "incident_score_missing_components": incident_score["missing_components"],
        "incident_score_weights": incident_score["weights"],
        "incident_score_weight_status": incident_score["weight_status"],
        "temporalRisk": None,
        "escalationScore": None,
        "socialGraphRisk": None,
        "historicalRisk": None,
        "CRS": None,
        "riskState": "Not available",
        "shapExplanation": {
            "status": "unavailable",
            "message": "Explanation unavailable",
            "feature_contributions": None,
            "timestamp": classification_timestamp,
            "modality": "contextual_risk",
            "modelVersion": None,
        },
        "modelVersion": prediction.get("model_version"),
        "modelVersions": {"classifier": prediction.get("model_version")},
    }
    _save_incident(incident_data)
    if _classification_debug:
        _logger.info(
            "Cascade incident decision model=%s p_bullying=%.6f "
            "gate_threshold=%.6f classification=CYBERBULLYING "
            "incident_created=true categories=%s",
            prediction["model_version"],
            prediction["risk_score"],
            prediction.get("gate_threshold", 0.0),
            prediction.get("categories", []),
        )

    # Asynchronously dispatch notifications without blocking incident creation
    import threading
    threading.Thread(target=notification_service.notify_parent, args=(incident_data,)).start()

    return {
        "status": "ok",
        "incidentId": inc.incidentId,
        "classification": "CYBERBULLYING",
        "incident_created": True,
        "p_bullying": prediction["risk_score"],
        "gate_threshold": prediction.get("gate_threshold"),
        "categories": prediction.get("categories", []),
    }


@app.get("/incidents")
def get_incidents(
    parentEmail: str | None = None,
    childName: str | None = None,
    childId: str | None = None,
    authenticated_email: str = Depends(require_parent),
):
    owner_email = _assert_parent_scope(parentEmail, authenticated_email)
    if childName and not childId:
        raise HTTPException(
            status_code=422,
            detail="A selected childId is required for child-scoped incident queries.",
        )
    if childId:
        return _child_incidents(owner_email, child_id=childId)
    return _parent_incidents(owner_email)


def _parent_incidents(parent_email: str) -> list[dict]:
    normalized_parent = account_store.normalize_email(parent_email)
    records = {
        str(incident.get("incidentId")): incident
        for incident in account_store.list_incidents(parent_email=normalized_parent)
        if incident.get("incidentId") and _is_harmful_incident(incident)
    }
    records.update(
        {
            str(incident.get("incidentId") or cache_id): incident
            for cache_id, incident in _incidents.items()
            if account_store.normalize_email(incident.get("parentEmail", ""))
            == normalized_parent
            and _is_harmful_incident(incident)
        }
    )
    return list(records.values())


def _incident_classification(incident: dict) -> str | None:
    classification = incident.get("classification")
    if classification is None:
        classification = incident.get("model_classification")
    if classification is None:
        classifier_output = incident.get("classifierOutput", {})
        if isinstance(classifier_output, dict):
            output = classifier_output.get("output", {})
            if isinstance(output, dict):
                classification = output.get("label")
    return str(classification) if classification is not None else None


def _incident_evidence(incident: dict, field: str, key: str) -> list:
    evidence = incident.get(field)
    if not isinstance(evidence, dict):
        return []
    items = evidence.get(key)
    return items if isinstance(items, list) else []


def _is_harmful_incident(incident: dict) -> bool:
    classification = _incident_classification(incident)
    if classification is None:
        return False
    return classification.strip().casefold() in {
        "bullying",
        "cyberbullying",
    }


def _resolve_child_identity(
    parent_email: str,
    child_id: str | None = None,
    child_name: str | None = None,
) -> tuple[str | None, str | None, set[str]]:
    normalized_id = child_id.strip() if child_id else None
    normalized_name = child_name.strip() if child_name else None
    profiles = account_store.list_child_profiles(parent_email)
    profile = next(
        (item for item in profiles if normalized_id == item["child_id"]),
        None,
    )
    if (
        profile is None
        and normalized_id is not None
        and normalized_name is not None
        and normalized_id.casefold() == normalized_name.casefold()
    ):
        profile = next(
            (
                item
                for item in profiles
                if normalized_name.casefold() == item["child_name"].casefold()
            ),
            None,
        )
    if profile is not None:
        canonical_id = profile["child_id"]
        canonical_name = profile["child_name"]
        aliases = {canonical_id, canonical_name}
    else:
        canonical_id = normalized_id or normalized_name
        canonical_name = None
        aliases = {normalized_id} if normalized_id else set()
    return canonical_id, canonical_name, aliases


def _child_incidents(
    parent_email: str,
    child_id: str,
) -> list[dict]:
    canonical_id, _, aliases = _resolve_child_identity(parent_email, child_id)
    if canonical_id is None:
        return []
    results = []
    for incident in _parent_incidents(parent_email):
        stored_id = str(incident.get("childId", "")).strip()
        if stored_id in aliases:
            normalized = dict(incident)
            normalized["childId"] = canonical_id
            results.append(normalized)
    return results


@app.get("/research/status")
def get_research_status():
    return capability_status()


def _media_analysis_unavailable(modality: str, media_reference: str) -> None:
    if not media_reference.strip():
        raise HTTPException(
            status_code=422,
            detail="A non-empty media_reference is required.",
        )
    modality_status = capability_status()["multimodal"][modality]
    raise HTTPException(
        status_code=503,
        detail={
            "status": "unavailable",
            "processing_status": f"{modality}_analysis_unavailable",
            "provider_status": modality_status["status"],
            "provider": modality_status.get("provider"),
            "message": f"{modality.capitalize()} analysis is unavailable; no result was produced.",
        },
    )


@app.post("/analyze/audio")
def analyze_audio(req: MediaAnalysisRequest):
    _media_analysis_unavailable("audio", req.media_reference)


@app.post("/analyze/image")
def analyze_image(req: MediaAnalysisRequest):
    _media_analysis_unavailable("image", req.media_reference)


@app.post("/analyze/video")
def analyze_video(req: MediaAnalysisRequest):
    _media_analysis_unavailable("video", req.media_reference)


@app.get("/children/{child_id}/risk")
def get_child_risk(
    child_id: str,
    parentEmail: str | None = None,
    currentAnalysis: str | None = None,
    authenticated_email: str = Depends(require_parent),
):
    owner_email = _assert_parent_scope(parentEmail, authenticated_email)
    incidents = _child_incidents(owner_email, child_id=child_id)
    canonical_child_id = (
        incidents[0]["childId"]
        if incidents
        else _resolve_child_identity(owner_email, child_id=child_id)[0]
    )
    current_message = None
    if currentAnalysis is not None:
        try:
            parsed_analysis = json.loads(currentAnalysis)
        except json.JSONDecodeError as error:
            raise HTTPException(
                status_code=422,
                detail="Current message analysis must be valid JSON.",
            ) from error
        if not isinstance(parsed_analysis, dict):
            raise HTTPException(
                status_code=422,
                detail="Current message analysis must be an object.",
            )
        if (
            parsed_analysis.get("model_version") != CASCADE_MODEL_VERSION
            or parsed_analysis.get("text_status") != "available"
            or parsed_analysis.get("classification") not in {"Bullying", "Clean"}
        ):
            raise HTTPException(
                status_code=422,
                detail="Current message analysis must contain a completed cascade text prediction.",
            )
        probability = parsed_analysis.get("probability")
        if probability is not None and (
            isinstance(probability, bool)
            or not isinstance(probability, (int, float))
            or not math.isfinite(probability)
            or not 0 <= probability <= 1
        ):
            raise HTTPException(
                status_code=422,
                detail="Current message probability must be between 0 and 1.",
            )
        for score_name in ("targeting_score", "severity_score"):
            score = parsed_analysis.get(score_name)
            if score is not None and (
                isinstance(score, bool)
                or not isinstance(score, (int, float))
                or not math.isfinite(score)
                or not 0 <= score <= 1
            ):
                raise HTTPException(
                    status_code=422,
                    detail=f"Current message {score_name} must be between 0 and 1.",
                )
        for evidence_name in ("targeting_evidence", "severity_evidence"):
            evidence = parsed_analysis.get(evidence_name, [])
            if not isinstance(evidence, list) or not all(
                isinstance(value, str) for value in evidence
            ):
                raise HTTPException(
                    status_code=422,
                    detail=f"Current message {evidence_name} must be a string array.",
                )
        current_message = parsed_analysis

    assessment = child_risk_assessment(
        incidents,
        canonical_child_id,
        current_message=current_message,
    )
    _persist_risk_snapshot(incidents, assessment)
    return assessment


@app.get("/children/{child_id}/timeline")
def get_child_timeline(
    child_id: str,
    parentEmail: str | None = None,
    authenticated_email: str = Depends(require_parent),
):
    owner_email = _assert_parent_scope(parentEmail, authenticated_email)
    incidents = _child_incidents(owner_email, child_id=child_id)
    canonical_child_id = (
        incidents[0]["childId"]
        if incidents
        else _resolve_child_identity(owner_email, child_id=child_id)[0]
    )
    ordered_incidents = sorted(
        incidents,
        key=lambda incident: (
            incident.get("timestamp")
            if isinstance(incident.get("timestamp"), (int, float))
            else float("-inf")
        ),
    )
    timeline = []
    for index, incident in enumerate(ordered_incidents):
        timestamp = incident.get("timestamp")
        try:
            point_in_time = datetime.fromtimestamp(
                float(timestamp) / 1000, timezone.utc
            )
        except (TypeError, ValueError, OSError):
            point_in_time = None
        assessment = child_risk_assessment(
            ordered_incidents[: index + 1],
            canonical_child_id,
            point_in_time,
        )
        _persist_risk_snapshot(
            ordered_incidents[: index + 1],
            assessment,
            point_in_time,
        )
        timeline.append(
            {
                "incident_id": incident["incidentId"],
                "child_id": canonical_child_id,
                "timestamp": timestamp,
                "classification": _incident_classification(incident),
                "category": incident.get("category"),
                "classifier_probability": stored_classifier_probability(incident),
                "severity_evidence": _incident_evidence(
                    incident, "severity_evidence", "indicators"
                ),
                "targeting_evidence": _incident_evidence(
                    incident, "targeting_evidence", "supporting_evidence"
                ),
                "crs": assessment["crs"],
                "risk_state": assessment["risk_state"],
                "status": assessment["status"],
            }
        )
    return {
        "child_id": canonical_child_id,
        "status": "available" if incidents else "no_history",
        "storage": "sqlite",
        "timeline": timeline,
    }


@app.get("/children/{child_id}/social-graph")
def get_child_social_graph(
    child_id: str,
    parentEmail: str | None = None,
    authenticated_email: str = Depends(require_parent),
):
    owner_email = _assert_parent_scope(parentEmail, authenticated_email)
    incidents = _child_incidents(owner_email, child_id=child_id)
    canonical_child_id = (
        incidents[0]["childId"]
        if incidents
        else _resolve_child_identity(owner_email, child_id=child_id)[0]
    )
    return {
        "child_id": canonical_child_id,
        **social_graph(
            incidents,
            canonical_child_id,
            weights=configured_weights("graph", SOCIAL_GRAPH_FEATURES),
        ),
    }


@app.get("/incidents/{incident_id}/explanation")
def get_incident_explanation(
    incident_id: str,
    parentEmail: str | None = None,
    authenticated_email: str = Depends(require_parent),
):
    owner_email = _assert_parent_scope(parentEmail, authenticated_email)
    incident = _require_incident_owner(incident_id, owner_email)
    child_id = incident.get("childId")
    incidents = _child_incidents(owner_email, child_id=child_id)
    incidents.sort(
        key=lambda item: (
            item.get("timestamp")
            if isinstance(item.get("timestamp"), (int, float))
            else float("-inf")
        )
    )
    incident_index = next(
        (
            index
            for index, item in enumerate(incidents)
            if item.get("incidentId") == incident_id
        ),
        None,
    )
    explanation = {
        "status": "unavailable",
        "message": "Explanation unavailable",
        "feature_contributions": None,
    }
    if incident_index is not None:
        try:
            point_in_time = datetime.fromtimestamp(
                float(incident.get("timestamp")) / 1000, timezone.utc
            )
        except (TypeError, ValueError, OSError):
            point_in_time = None
        assessment = child_risk_assessment(
            incidents[: incident_index + 1],
            child_id,
            point_in_time,
        )
        _persist_risk_snapshot(
            incidents[: incident_index + 1],
            assessment,
            point_in_time,
        )
        explanation = assessment["risk_fusion"]["explanation"]
    contributions = explanation.get("feature_contributions")
    return {
        "incident_id": incident_id,
        "status": explanation["status"],
        "shap_values": contributions,
        "contributors": contributions,
        "base_value": explanation.get("base_value"),
        "explained_output": explanation.get("explained_output"),
        "model_output": explanation.get("model_output"),
        "message": explanation["message"],
        "parent_action": incident["parentDecision"],
    }


@app.get("/settings/notifications", response_model=NotificationPreferences)
def get_notification_settings(
    parentEmail: str | None = None,
    authenticated_email: str = Depends(require_parent),
):
    return notification_service.get_preferences(
        _assert_parent_scope(parentEmail, authenticated_email)
    )


@app.post("/settings/notifications", response_model=NotificationPreferences)
def update_notification_settings(
    prefs: NotificationPreferences,
    authenticated_email: str = Depends(require_parent),
):
    _assert_parent_scope(prefs.parentEmail, authenticated_email)
    return notification_service.update_preferences(prefs)


@app.get("/notification-logs")
def get_notification_logs(
    incidentId: str | None = None,
    parentEmail: str | None = None,
    authenticated_email: str = Depends(require_parent),
):
    owner_email = _assert_parent_scope(parentEmail, authenticated_email)
    return notification_service.get_logs(incidentId, owner_email)


# Specific Required Parent Endpoints
@app.post("/parent/incidents/{incident_id}/block")
def parent_block(
    incident_id: str,
    authenticated_email: str = Depends(require_parent),
):
    inc = dict(_require_incident_owner(incident_id, authenticated_email))
    if inc["status"] != "PENDING_PARENT_REVIEW":
        return {"messageId": incident_id, "decision": "BLOCK", "status": inc["status"]}

    inc["parentDecision"] = "BLOCK"
    inc["status"] = "BLOCKED"
    _save_incident(inc)
    return {"messageId": incident_id, "decision": "BLOCK", "status": "BLOCKED"}


@app.post("/parent/incidents/{incident_id}/edit")
def parent_edit(
    incident_id: str,
    req: DecisionRequest,
    authenticated_email: str = Depends(require_parent),
):
    inc = dict(_require_incident_owner(incident_id, authenticated_email))
    inc["parentDecision"] = "EDIT"
    inc["guidance"] = req.guidance or "Please rephrase your message before sending."
    inc["editedContent"] = req.editedContent
    inc["status"] = "EDIT_REQUIRED"
    _save_incident(inc)
    return {
        "messageId": incident_id,
        "decision": "EDIT",
        "status": "EDIT_REQUIRED",
        "editedContent": req.editedContent,
        "askChildToEdit": req.editedContent is None
    }


@app.post("/parent/incidents/{incident_id}/allow")
def parent_allow(
    incident_id: str,
    authenticated_email: str = Depends(require_parent),
):
    inc = dict(_require_incident_owner(incident_id, authenticated_email))
    inc["parentDecision"] = "ALLOW"
    inc["status"] = "ALLOWED"
    _save_incident(inc)
    return {"messageId": incident_id, "decision": "ALLOW", "status": "ALLOWED"}


@app.get("/child/pending-decisions")
def child_pending_decisions(authenticated_email: str = Depends(require_parent)):
    return [
        incident
        for incident in _incidents.values()
        if account_store.normalize_email(incident.get("parentEmail", "")) == authenticated_email
        and incident["status"] in ["PENDING_PARENT_REVIEW", "EDIT_REQUIRED"]
    ]


@app.post("/child/messages/{message_id}/retry")
def child_message_retry(
    message_id: str,
    authenticated_email: str = Depends(require_parent),
):
    _require_incident_owner(message_id, authenticated_email)
    return {"status": "ok", "messageId": message_id, "retried": True}


# Generic decision fallback
@app.post("/incidents/{incident_id}/decision")
def submit_decision(
    incident_id: str,
    req: DecisionRequest,
    authenticated_email: str = Depends(require_parent),
):
    inc = dict(_require_incident_owner(incident_id, authenticated_email))
    inc["parentDecision"] = req.decision
    inc["guidance"] = req.guidance
    inc["editedContent"] = req.editedContent
    if req.decision in ["ALLOW", "SHOW"]:
        inc["status"] = "ALLOWED"
    elif req.decision in ["BLOCK", "HIDE"]:
        inc["status"] = "BLOCKED"
    else:
        inc["status"] = "EDIT_REQUIRED"
    _save_incident(inc)
    return {"status": "ok", "incidentId": incident_id, "status_updated": inc["status"]}


@app.get("/incidents/{incident_id}/decision")
def get_decision(
    incident_id: str,
    authenticated_email: str = Depends(require_parent),
):
    inc = _require_incident_owner(incident_id, authenticated_email)
    return {
        "incidentId": inc["incidentId"],
        "status": inc["status"],
        "parentDecision": inc["parentDecision"],
        "guidance": inc["guidance"],
        "editedContent": inc["editedContent"]
    }


@app.get("/settings", response_model=ParentSettings)
def get_settings(authenticated_email: str = Depends(require_parent)):
    settings = _parent_settings.setdefault(authenticated_email, dict(_default_parent_settings))
    return ParentSettings(**settings)


@app.post("/settings")
def update_settings(
    settings: ParentSettings,
    authenticated_email: str = Depends(require_parent),
):
    _parent_settings[authenticated_email] = settings.model_dump()
    return {"status": "ok", "settings": _parent_settings[authenticated_email]}


class AlertRequest(BaseModel):
    deviceId: str
    type: str
    appPackage: str
    score: float
    timestamp: int
    parentEmail: str
    parentPhone: str
    emailEnabled: bool = True
    smsEnabled: bool = True


@app.post("/alerts")
def post_alert(req: AlertRequest, x_api_key: str | None = Header(default=None, alias="X-API-Key")):
    expected_api_key = os.environ.get("API_KEY")
    if not expected_api_key:
        raise HTTPException(
            status_code=503,
            detail="Alert delivery is not configured on this server.",
        )
    if not x_api_key or not secrets.compare_digest(x_api_key, expected_api_key):
        raise HTTPException(status_code=401, detail="Invalid or missing X-API-Key header")

    package_map = {
        "com.whatsapp": "WhatsApp",
        "com.instagram.android": "Instagram",
        "com.google.android.gm": "Gmail",
        "com.childsafelens.demo": "ChildSafeLens Demo"
    }
    app_name = package_map.get(req.appPackage, req.appPackage.split('.')[-1].capitalize())

    if req.type == "OUTGOING_SENT_ANYWAY":
        msg_text = f"Your child sent a message on {app_name} that was flagged as potentially hurtful."
    elif req.type == "INCOMING_BULLYING":
        msg_text = f"Your child may have received a harmful message on {app_name}."
    else:
        msg_text = f"Safety alert regarding activity on {app_name}."

    success_count = 0
    errors = []

    if req.emailEnabled and req.parentEmail:
        try:
            subject = f"[ChildSafeLens] Safety Alert — {app_name}"
            html_body = f"""
            <html>
            <body>
                <h2>ChildSafeLens Alert</h2>
                <p>{msg_text}</p>
                <ul>
                    <li><b>App:</b> {app_name}</li>
                    <li><b>Severity Score:</b> {req.score:.2f}</li>
                    <li><b>Time:</b> {datetime.fromtimestamp(req.timestamp / 1000.0, timezone.utc).strftime('%d %b %Y, %I:%M %p')} UTC</li>
                </ul>
                <p>Please open the Parent Dashboard to review.</p>
            </body>
            </html>
            """
            result = notification_service.email_provider.send_email(
                req.parentEmail, subject, html_body
            )
            if result.get("status") == "SENT":
                success_count += 1
            else:
                errors.append("Email failed: provider did not confirm delivery.")
        except Exception as e:
            errors.append(f"Email failed: {e}")

    if req.smsEnabled and req.parentPhone:
        try:
            sms_text = f"ChildSafeLens Alert: {msg_text} Open Parent Dashboard to review."
            if len(sms_text) > 160:
                sms_text = sms_text[:157] + "..."
            result = notification_service.sms_provider.send_sms(req.parentPhone, sms_text)
            if result.get("status") == "SENT":
                success_count += 1
            else:
                errors.append("SMS failed: provider did not confirm delivery.")
        except Exception as e:
            errors.append(f"SMS failed: {e}")

    if success_count == 0 and (req.emailEnabled or req.smsEnabled):
        raise HTTPException(status_code=502, detail=f"All notification channels failed: {errors}")

    return {"status": "ok", "deliveredChannels": success_count}


@app.delete("/events")
def clear_events(x_api_key: str | None = Header(default=None, alias="X-API-Key")):
    expected_api_key = os.environ.get("API_KEY")
    if not expected_api_key:
        raise HTTPException(status_code=503, detail="Administrative clearing is not configured.")
    if not x_api_key or not secrets.compare_digest(x_api_key, expected_api_key):
        raise HTTPException(status_code=401, detail="Invalid or missing X-API-Key header")
    _events.clear()
    _incidents.clear()
    account_store.clear_incidents_and_risk_events()
    return {"status": "cleared"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
