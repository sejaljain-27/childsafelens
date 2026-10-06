# ChildSafeLens Demo Backend

FastAPI service for the ChildSafeLens demo. It preserves the existing
`/predict`, `/log-event`, and `/events` contracts, and exposes incident,
child-risk, timeline, social-graph, explanation, and capability-status routes.

## 1. Run it locally

```bash
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Visit `http://localhost:8000/docs` — FastAPI gives you a free interactive
test page for all three endpoints, no need to write curl commands to try it.

## 2. Cyberbullying cascade classifier

The `/predict` endpoint loads the supplied two-stage cascade from
`models/cyberbullying_cascade/`: the Keras artifact, metadata, and matching
`cb_model.py` / `cb_text.py` inference code. Stage 1 returns the bullying probability and
applies the threshold in the model metadata; Stage 2 returns the model's
category for messages that pass the gate. A clean result exits before category
classification.

Android sends chat text to this backend endpoint, and the parent dashboard
reads classifier status and resulting incidents from the same backend. The
model is reported as `real` with version `cyberbullying-cascade-v4`, but
`validated` remains false: connecting the supplied artifact does not
independently validate its performance.

The complete supplied bundle is retained together in this directory. Backend
inference uses the supplied `.keras` file, metadata, and source; the supplied
weights and TFLite exports are preserved but are not loaded by this backend.

Set `CHILDSAFELENS_CASCADE_MODEL_DIR` to select another model directory, or set
`CHILDSAFELENS_CASCADE_MODEL_PATH` and
`CHILDSAFELENS_CASCADE_METADATA_PATH` separately. Missing artifacts fail
classification explicitly with HTTP 503 / `MODEL_UNAVAILABLE`; the service
does not substitute a dummy classifier or create an incident. The supplied
model source and weights are used as provided; no model is retrained by this
integration.

Parent accounts and child profiles are stored in a SQLite database shared by
the Android app and dashboard backend. Parent sign-up/sign-in uses the same
email and password on both clients; Android child-profile creation registers
the profile with that account, and incidents carry that parent's email and
active child's name. The account database defaults to
`backend/data/accounts.sqlite3`; set `CHILDSAFELENS_ACCOUNT_DB` to change it.

For a child chat running against this local backend, set
`EXPO_PUBLIC_API_BASE_URL` to the backend base URL; the existing demo URL
remains the default when no environment variable is set.

The supplied cascade includes a category head for Blackmail, Harassment,
Humiliation, Insult, Physical Harm Indication, and Threat. A `Bullying`
prediction returns the model's category result; a `Clean` prediction exits
before category classification and returns `category_status: "skipped_clean"`.
These predictions are model output, not independently validated findings.
An exact standalone `hi` (case-insensitive, optional surrounding whitespace
and terminal punctuation) is an explicit safe-greeting override: its actual
model probability and raw model classification remain in the response, while
it is treated as CLEAN and cannot create a parent incident. All other text
continues to follow the model gate.

## 3. Deploy so B and D can reach it from their phones

Render (free tier, simplest for a 5-day demo):

1. Push this `backend/` folder to a GitHub repo.
2. On [render.com](https://render.com) → New → Web Service → connect the repo.
3. Build command: `pip install -r requirements.txt`
4. Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
5. Deploy. Render gives you a public URL like `https://childsafelens-api.onrender.com`.
6. Share that URL with B and D immediately — they set it as `API_BASE_URL`
   in their apps (see the mobile-app README).

Railway works the same way if you prefer it instead.

## 4. Quick manual test

```bash
curl -X POST https://<your-url>/predict \
  -H "Content-Type: application/json" \
  -d '{"text": "you are so stupid, i hate you"}'

curl -X POST https://<your-url>/log-event \
  -H "Content-Type: application/json" \
  -d '{"risk_level": "high_risk"}'

curl https://<your-url>/events
```

## 5. Persistence and server configuration

Parent accounts, child profiles, incidents, and `/log-event` records use the
same SQLite database at `backend/data/accounts.sqlite3`. Set
`CHILDSAFELENS_ACCOUNT_DB` to select a persistent deployment volume. Existing
accounts/profile tables remain unchanged; incident and event tables are
created additively. Incidents store the existing response payload plus indexed
owner/child/time/status fields. The API loads the records on startup, and
parent actions and risk snapshots are written through to SQLite. `DELETE
/events` retains its existing route/response and clears its in-memory and
SQLite event/incident data; accounts and child profiles remain.

Only the message snippet (limited to 280 characters) is retained for the
parent-review contract. The full `messageText` is used for classification but
is not stored. Media bytes/captions are not stored. An optional
`evidenceReference` must be an opaque URL/path-free token; this backend does
not resolve or serve evidence references (accepted tokens are 32–128
URL-safe characters; callers should generate them with a cryptographically
secure random source). SQLite is not encrypted by this
application, so restrict access to its deployment volume and backups. There
is no automatic age-based deletion policy yet; clear records with `DELETE
/events` or implement a retention period approved for the deployment.

`/predict`, `/log-event`, and `/events` keep their existing response contracts;
model name/version, timestamp, modality, and processing status are additive
provenance fields where available. Incident records include classifier,
targeting, severity, multimodal, incident-score, and current risk/SHAP
snapshots. Unavailable model outputs remain null/status-only rather than
being synthesized.

Set `API_KEY` in the backend process environment to enable `/alerts`; there is
no checked-in/default API key. Set `SARVAM_API_KEY` and any provider secrets
only in the backend environment, never in dashboard/mobile configuration.
SMS and email delivery require configured providers; unconfigured or failed
SMS, email, and unimplemented FCM delivery are recorded as failed rather than
reported as sent. Notification preferences have no default phone-number or
email-address destination; configure real parent contact details explicitly.
`.env` files and the SQLite data directory are ignored by Git. Set
`CHILDSAFELENS_ALLOWED_ORIGINS` to a comma-separated list of trusted browser
origins when deploying; local Expo origins are allowed by default.

Parent login and registration issue signed bearer tokens. Set
`CHILDSAFELENS_AUTH_SECRET` in the backend process environment to a private,
random value of at least 32 bytes; keep it stable across restarts so active
sessions remain valid. For a local PowerShell session, generate a temporary
secret before starting Uvicorn:

```powershell
$bytes = New-Object byte[] 48
[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$env:CHILDSAFELENS_AUTH_SECRET = [Convert]::ToBase64String($bytes)
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

For deployments, configure the secret in the hosting provider's environment
settings rather than committing it. Parent-profile, incident, child-risk,
analytics, settings, and parent-decision routes require `Authorization:
Bearer <access_token>` and scope records to the authenticated parent. The
dashboard stores the token in browser local storage; Android stores it in
encrypted preferences. `/predict` remains available without parent
authentication for child-chat classification.

## 6. Resetting between rehearsals

`DELETE /events` clears persisted incidents and `/log-event` records so the
dashboard starts with empty counts. It does not delete accounts or profiles.

## Research risk-assessment foundation

The existing incident and parent-decision APIs remain in place. The
`/research/status`, `/children/risk`, `/children/{child_id}/risk`,
`/children/{child_id}/timeline`, `/children/{child_id}/social-graph`, and
`/incidents/{incident_id}/explanation` endpoints expose current evidence and
capability status. Timeline risk is recomputed from each actual incident
prefix. The incident explanation route returns actual risk-fusion TreeSHAP
contributions when available, preserving the parent-action field; otherwise
it returns `status: unavailable` and `"Explanation unavailable"`. History
is persisted in the existing SQLite incident records and loaded on backend
startup.

`POST /analyze/audio`, `/analyze/image`, and `/analyze/video` accept a JSON
`media_reference` and return HTTP 503 with modality-specific
`processing_status` when no provider implementation is available. These
routes do not fetch, persist, caption, classify, or create incidents from
media. `/research/status` reports provider availability; unsupported analysis
never returns fabricated output.

The dashboard reports counts from actual stored incidents. Targeting cues,
severity categories, and sender relationships are included only when the
incident request supplies the corresponding context. They are evidence, not
calibrated probabilities or risk scores. Historical risk H remains a
contextual component; CRS and the categorical Child Risk State are produced
only from an actual configured XGBoost risk-fusion model. The available
datasets contain message-level labels, not child-level time-window risk
targets, so this repository currently has no valid risk-fusion training target.
It never trains a risk model from those message labels or dummy classifier
results. Inspection found 18,131 rows in
`ChildSafeLens_Final_Dataset (1).csv`, 10,000 in
`hinglish_cyberbullying_dataset_10k_userwords (1).csv`, and 44,148 in
`ipd_merged_dataset.csv`; their labels are message-level bullying/non-bullying,
and none contains child IDs.

The optional XGBoost interface is in `risk_fusion.py`. It consumes, in exact
order, `[incident_score, temporal_risk, escalation, social_graph, historical]`
and refuses prediction if a component is missing. It loads no artifact by
default and reports: "XGBoost requires a research-defined training target."
Loading requires a declared target ID and an explicitly validated target
(`CHILDSAFELENS_RISK_TRAINING_TARGET`,
`CHILDSAFELENS_RISK_TRAINING_TARGET_VALIDATED=true`), plus a compatible
`CHILDSAFELENS_RISK_MODEL` artifact in XGBoost JSON or UBJ format. The artifact
must include the exact feature names/order, matching
`childsafelens_target_id` metadata, and `childsafelens_output_scale=0_1`. The
optional `xgboost` runtime dependency is not installed by this change. Only the
loaded model's numeric output in [0, 1] may become CRS (scaled to 0–100); there
is no fallback or score derived from historical risk alone.

When both the model and SHAP are available, the same XGBoost Booster/input is
explained with `shap.TreeExplainer`. Returned feature contributions are actual
TreeSHAP values in the model's raw-margin space:
`raw_margin = base_value + sum(feature_contributions)`. The response includes
each ordered feature/value pair and is returned only when the contributions
reconstruct XGBoost's actual raw-margin output within tolerance. This is
explicitly not the probability-space CRS. Missing models/dependencies,
incompatible SHAP results, or calculation failures return
`"Explanation unavailable"` with no contributions. SHAP is optional and is
not installed by this change; the existing dashboard is unchanged.

Each incident stores a Current Incident Score only when classifier probability,
targeting score, severity score, multimodal score, and all four configured
weights are available. Configure weights with
`CHILDSAFELENS_INCIDENT_CLASSIFIER_WEIGHT`,
`CHILDSAFELENS_INCIDENT_TARGETING_WEIGHT`,
`CHILDSAFELENS_INCIDENT_SEVERITY_WEIGHT`, and
`CHILDSAFELENS_INCIDENT_MULTIMODAL_WEIGHT`. They are normalized for the
weighted sum and are development parameters, not validated values. Missing
component evidence or weights leaves `incident_score` null with a status and
missing-component list; class labels are never converted to probabilities.
Targeting examines the text and only the supplied child identity/reply
context. Unprovided signals are omitted; second-person wording by itself is
recorded but does not confirm that a message targets this child. A targeting
score is returned only when direct targeting evidence and explicit weights
for its available signals exist. Severity examines actual text for explicit
insult, harassment, humiliation, threat, blackmail, and physical-harm cues,
along with any supplied severity indicators; it does not require a category
classifier or other media. These cue matches are evidence, not calibrated
probabilities, and a severity score remains null unless explicit severity
weights are configured. Missing image/audio/video evidence does not invalidate
text-based targeting or severity analysis. The combined incident score still
remains unavailable when any of its required component scores are absent.

Temporal risk is computed from stored incidents only when each record contains
an actual Current Incident Score and targeting score, with a positive
`CHILDSAFELENS_TEMPORAL_DECAY_PER_SECOND` (λ). It decays by incident age and
therefore falls as activity stops. Escalation compares the latest stored
severity score against the EMA of earlier stored severity scores using
`CHILDSAFELENS_ESCALATION_ALPHA` (α, greater than 0 and at most 1); it remains
unavailable without an actual current severity and prior severity history.
These are separate measures: temporal risk describes repetition/recency, and
escalation describes an increase in severity.

Historical risk is computed only when actual temporal scores and
`CHILDSAFELENS_HISTORICAL_RETENTION` (eta) are available, where 0 <= eta < 1.
It applies the EMA to prior states derived chronologically from stored incident
scores and temporal values; the initial state is the first actual temporal
value. At read time the latest state is recomputed against current decayed
temporal risk, so it can decrease when activity stops. `risk_state` maps the
XGBoost CRS through configured warning, high, and critical thresholds.
`research_state` returns `[P, D, S, M, R, E, G, H]` with each actual value and
status separately; unavailable components are `null`. This is a research
state, not a validated clinical or predictive assessment.

The social graph uses NetworkX `MultiDiGraph` edges built only from stored
incidents with both a real `senderId` and `childId`. Each edge represents one
verified harmful interaction. `attackers` is the distinct observed sender
count, `concentration` is the largest sender's share of observed interactions,
and `frequency` is the observed interaction count. A graph score is returned
only when all three weights are configured through
`CHILDSAFELENS_GRAPH_ATTACKERS_WEIGHT`,
`CHILDSAFELENS_GRAPH_CONCENTRATION_WEIGHT`, and
`CHILDSAFELENS_GRAPH_FREQUENCY_WEIGHT`; normalized weights are applied to the
observed features. This is a development metric, not a calibrated risk
probability. Social history is derived from incident records persisted in
SQLite. Missing sender/child identifiers are excluded from edges and marked
as incomplete history. The current Android incident sender does not populate
`senderId`, so its synced incidents cannot produce attacker or graph-score
values until real sender identifiers are supplied; no identity is inferred
from the message or package name.

Thresholds can be adjusted centrally with
`CHILDSAFELENS_WARNING_THRESHOLD`, `CHILDSAFELENS_HIGH_THRESHOLD`, and
`CHILDSAFELENS_CRITICAL_THRESHOLD` (initial defaults: 25, 50, and 75).
Feature-weight configuration uses `CHILDSAFELENS_<GROUP>_<FEATURE>_WEIGHT`;
all weights for a group must be supplied and sum to a positive value. These
parameters are research settings, not empirically validated values. Missing
weights, trained research models, provider implementations, or scored history
remain explicitly unavailable rather than being filled with defaults.

When the supplied PKL is loaded, classifier output reports the real model
version and is not marked as a development simulation; it remains
`validated: false`. Only the missing-artifact development fallback is marked
as dummy/simulation. The parent dashboard shows dummy classifier status
separately from the unavailable Child Risk State (CRS).

Before fitting XGBoost, collect time-ordered, child-level research
annotations using a documented rubric for Safe, Warning, High, and Critical.
Have qualified annotators independently label the same child/time windows,
adjudicate disagreements, and record the evidence and time window used.
Split evaluation by child (and chronologically within each child) to avoid
leakage. Only train after the labels, feature definitions, and evaluation
protocol are approved; do not derive child-risk labels from the existing
message-level cyberbullying labels.

Audio (Sarvam), image (thinkingmachines/Inkling), and video processing
providers are reported as not implemented until their server-side
integrations are added. Status checks reveal only whether credentials are
configured; never send provider keys to the dashboard.
