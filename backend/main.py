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
from datetime import datetime, timezone
from typing import Literal

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from model import score_text

app = FastAPI(title="ChildSafeLens Demo API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

_events = []
_incidents = {} # incident_id -> incident dict
_parent_settings = {
    "medium_risk_timeout_action": "ALLOW",
    "high_risk_timeout_action": "BLOCK",
    "critical_risk_timeout_action": "KEEP_PENDING",
    "timeout_seconds": 60
}

RiskLevel = Literal["low_risk", "medium_risk", "high_risk"]


class PredictRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=2000)


class PredictResponse(BaseModel):
    risk_score: float
    is_risky: bool
    label: RiskLevel


class LogEventRequest(BaseModel):
    risk_level: RiskLevel
    timestamp: str | None = None


class IncidentCreate(BaseModel):
    incidentId: str
    parentEmail: str = "default_parent@test.com"
    childId: str = "default_child"
    childName: str = "Aarav"
    type: str
    messageSnippet: str
    riskScore: float
    riskLevel: str
    category: str
    packageName: str
    timestamp: int
    status: str = "PENDING_PARENT_REVIEW"


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


@app.post("/predict", response_model=PredictResponse)
def predict(req: PredictRequest):
    risk_score, label, is_risky = score_text(req.text)
    return PredictResponse(risk_score=round(risk_score, 4), is_risky=is_risky, label=label)


@app.post("/log-event")
def log_event(req: LogEventRequest):
    timestamp = req.timestamp or datetime.now(timezone.utc).isoformat()
    event_id = f"evt_{uuid.uuid4().hex[:8]}"
    _events.append({"event_id": event_id, "risk_level": req.risk_level, "timestamp": timestamp})
    return {"status": "ok", "event_id": event_id}


@app.get("/events")
def get_events(parentEmail: str | None = None, childName: str | None = None):
    high = sum(1 for e in _events if e["risk_level"] == "high_risk")
    medium = sum(1 for e in _events if e["risk_level"] == "medium_risk")
    low = sum(1 for e in _events if e["risk_level"] == "low_risk")
    return {"total_events": len(_events), "high_risk_count": high, "medium_risk_count": medium, "low_risk_count": low}


@app.post("/incidents")
def create_incident(inc: IncidentCreate):
    _incidents[inc.incidentId] = {
        "incidentId": inc.incidentId,
        "parentEmail": inc.parentEmail,
        "childId": inc.childId,
        "childName": inc.childName,
        "type": inc.type,
        "messageSnippet": inc.messageSnippet,
        "riskScore": inc.riskScore,
        "riskLevel": inc.riskLevel,
        "category": inc.category,
        "packageName": inc.packageName,
        "timestamp": inc.timestamp,
        "status": inc.status,
        "parentDecision": None,
        "guidance": None,
        "editedContent": None
    }
    return {"status": "ok", "incidentId": inc.incidentId}


@app.get("/incidents")
def get_incidents(parentEmail: str | None = None, childName: str | None = None):
    results = list(_incidents.values())
    if parentEmail:
        results = [i for i in results if i.get("parentEmail", "").lower() == parentEmail.lower()]
    if childName:
        results = [i for i in results if i.get("childName", "").lower() == childName.lower()]
    return results


# Specific Required Parent Endpoints
@app.post("/parent/incidents/{incident_id}/block")
def parent_block(incident_id: str):
    if incident_id not in _incidents:
        raise HTTPException(status_code=404, detail="Incident not found")
    inc = _incidents[incident_id]
    if inc["status"] != "PENDING_PARENT_REVIEW":
        return {"messageId": incident_id, "decision": "BLOCK", "status": inc["status"]}

    inc["parentDecision"] = "BLOCK"
    inc["status"] = "BLOCKED"
    return {"messageId": incident_id, "decision": "BLOCK", "status": "BLOCKED"}


@app.post("/parent/incidents/{incident_id}/edit")
def parent_edit(incident_id: str, req: DecisionRequest):
    if incident_id not in _incidents:
        raise HTTPException(status_code=404, detail="Incident not found")
    inc = _incidents[incident_id]
    inc["parentDecision"] = "EDIT"
    inc["guidance"] = req.guidance or "Please rephrase your message before sending."
    inc["editedContent"] = req.editedContent
    inc["status"] = "EDIT_REQUIRED"
    return {
        "messageId": incident_id,
        "decision": "EDIT",
        "status": "EDIT_REQUIRED",
        "editedContent": req.editedContent,
        "askChildToEdit": req.editedContent is None
    }


@app.post("/parent/incidents/{incident_id}/allow")
def parent_allow(incident_id: str):
    if incident_id not in _incidents:
        raise HTTPException(status_code=404, detail="Incident not found")
    inc = _incidents[incident_id]
    inc["parentDecision"] = "ALLOW"
    inc["status"] = "ALLOWED"
    return {"messageId": incident_id, "decision": "ALLOW", "status": "ALLOWED"}


@app.get("/child/pending-decisions")
def child_pending_decisions():
    return [i for i in _incidents.values() if i["status"] in ["PENDING_PARENT_REVIEW", "EDIT_REQUIRED"]]


@app.post("/child/messages/{message_id}/retry")
def child_message_retry(message_id: str):
    return {"status": "ok", "messageId": message_id, "retried": True}


# Generic decision fallback
@app.post("/incidents/{incident_id}/decision")
def submit_decision(incident_id: str, req: DecisionRequest):
    if incident_id not in _incidents:
        raise HTTPException(status_code=404, detail="Incident not found")

    inc = _incidents[incident_id]
    inc["parentDecision"] = req.decision
    inc["guidance"] = req.guidance
    inc["editedContent"] = req.editedContent
    if req.decision in ["ALLOW", "SHOW"]:
        inc["status"] = "ALLOWED"
    elif req.decision in ["BLOCK", "HIDE"]:
        inc["status"] = "BLOCKED"
    else:
        inc["status"] = "EDIT_REQUIRED"
    return {"status": "ok", "incidentId": incident_id, "status_updated": inc["status"]}


@app.get("/incidents/{incident_id}/decision")
def get_decision(incident_id: str):
    if incident_id not in _incidents:
        raise HTTPException(status_code=404, detail="Incident not found")
    inc = _incidents[incident_id]
    return {
        "incidentId": inc["incidentId"],
        "status": inc["status"],
        "parentDecision": inc["parentDecision"],
        "guidance": inc["guidance"],
        "editedContent": inc["editedContent"]
    }


@app.get("/settings", response_model=ParentSettings)
def get_settings():
    return ParentSettings(**_parent_settings)


@app.post("/settings")
def update_settings(settings: ParentSettings):
    global _parent_settings
    _parent_settings = settings.dict()
    return {"status": "ok", "settings": _parent_settings}


@app.delete("/events")
def clear_events():
    _events.clear()
    _incidents.clear()
    return {"status": "cleared"}
