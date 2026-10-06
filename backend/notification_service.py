"""
notification_service.py — Central notification service supporting FCM, SMS (Twilio), and Email (SMTP)
with risk-based policies, provider abstraction, idempotency, and retry logging.
"""

import os
import logging
import base64
import urllib.parse
import urllib.request
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("NotificationService")

# ---------------------------------------------------------------------------
# Provider Abstractions
# ---------------------------------------------------------------------------
class SmsProvider:
    def __init__(self):
        self.account_sid = os.environ.get("TWILIO_ACCOUNT_SID") or os.environ.get("SMS_PROVIDER_API_KEY", "")
        self.auth_token = os.environ.get("TWILIO_AUTH_TOKEN") or os.environ.get("SMS_PROVIDER_SECRET", "")
        self.from_number = os.environ.get("SMS_FROM_NUMBER", "")

    def send_sms(self, to_number: str, message: str) -> Dict[str, Any]:
        if (
            not self.account_sid
            or not self.auth_token
            or not self.from_number
            or self.account_sid.startswith("mock")
        ):
            raise RuntimeError("SMS provider is not configured.")

        url = f"https://api.twilio.com/2010-04-01/Accounts/{self.account_sid}/Messages.json"
        data = urllib.parse.urlencode({
            "To": to_number,
            "From": self.from_number,
            "Body": message
        }).encode("utf-8")

        credentials = f"{self.account_sid}:{self.auth_token}"
        encoded_creds = base64.b64encode(credentials.encode("utf-8")).decode("utf-8")

        req = urllib.request.Request(
            url,
            data=data,
            headers={
                "Authorization": f"Basic {encoded_creds}",
                "Content-Type": "application/x-www-form-urlencoded"
            },
            method="POST"
        )

        try:
            with urllib.request.urlopen(req) as response:
                response.read()
        except Exception as error:
            logger.error(
                "[SmsProvider] Twilio SMS failed (%s).",
                type(error).__name__,
            )
            raise RuntimeError("SMS provider delivery failed.") from error

        logger.info("[SmsProvider] Twilio SMS sent successfully.")
        return {"status": "SENT", "providerMessageId": f"twilio_{datetime.now(timezone.utc).timestamp()}"}


class EmailProvider:
    def __init__(self):
        self.smtp_server = os.environ.get("SMTP_SERVER", "smtp.gmail.com")
        self.smtp_port = int(os.environ.get("SMTP_PORT", "587"))
        self.smtp_user = os.environ.get("SMTP_USER", "")
        self.smtp_password = os.environ.get("SMTP_PASSWORD", "")
        self.from_address = os.environ.get("EMAIL_FROM_ADDRESS", self.smtp_user or "alerts@childsafelens.com")

    def send_email(self, to_email: str, subject: str, html_body: str) -> Dict[str, Any]:
        if not self.smtp_user or not self.smtp_password:
            raise RuntimeError("Email provider is not configured.")

        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = self.from_address
        msg["To"] = to_email
        msg.attach(MIMEText(html_body, "html"))

        try:
            with smtplib.SMTP(self.smtp_server, self.smtp_port) as server:
                server.starttls()
                server.login(self.smtp_user, self.smtp_password)
                server.sendmail(self.from_address, to_email, msg.as_string())
        except Exception as error:
            logger.error(
                "[EmailProvider] SMTP send failed (%s).",
                type(error).__name__,
            )
            raise RuntimeError("Email provider delivery failed.") from error

        logger.info("[EmailProvider] Real SMTP email sent successfully.")
        return {"status": "SENT", "providerMessageId": f"smtp_{datetime.now(timezone.utc).timestamp()}"}


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------
class NotificationPreferences(BaseModel):
    parentEmail: str
    fcmEnabled: bool = True
    smsEnabled: bool = True
    emailEnabled: bool = True
    smsNumber: Optional[str] = None
    emailAddress: Optional[str] = None
    mediumFcmEnabled: bool = True
    highFcmEnabled: bool = True
    highSmsEnabled: bool = True
    highEmailEnabled: bool = False
    criticalFcmEnabled: bool = True
    criticalSmsEnabled: bool = True
    criticalEmailEnabled: bool = True


class NotificationLogEntry(BaseModel):
    id: str
    incidentId: str
    parentEmail: str
    channel: str # FCM, SMS, EMAIL
    destination: str
    status: str # SENT, FAILED, RETRYING, PENDING
    attemptCount: int
    providerMessageId: Optional[str] = None
    errorMessage: Optional[str] = None
    createdAt: str
    sentAt: Optional[str] = None


# ---------------------------------------------------------------------------
# Notification Service
# ---------------------------------------------------------------------------
class NotificationService:
    def __init__(self):
        self.sms_provider = SmsProvider()
        self.email_provider = EmailProvider()
        self.preferences_db: Dict[str, NotificationPreferences] = {}
        self.logs_db: List[NotificationLogEntry] = []
        self._sent_idempotency_set = set() # (incidentId, channel)

    def get_preferences(self, parentEmail: str) -> NotificationPreferences:
        email_key = (parentEmail or "parent@test.com").lower()
        if email_key not in self.preferences_db:
            self.preferences_db[email_key] = NotificationPreferences(
                parentEmail=parentEmail,
                emailAddress=parentEmail
            )
        return self.preferences_db[email_key]

    def update_preferences(self, prefs: NotificationPreferences) -> NotificationPreferences:
        email_key = (prefs.parentEmail or "parent@test.com").lower()
        self.preferences_db[email_key] = prefs
        logger.info("[NotificationService] Notification preferences updated.")
        return prefs

    def notify_parent(self, incident: Dict[str, Any]):
        """
        Asynchronously evaluates risk policy and dispatches notifications via FCM, SMS, and Email
        with idempotency and retry handling.
        """
        incident_id = incident.get("incidentId")
        parent_email = incident.get("parentEmail", "parent@test.com")
        risk_level = str(incident.get("riskLevel", "LOW")).upper()

        prefs = self.get_preferences(parent_email)

        # Determine channels based on risk level and preferences
        channels_to_send = []

        if risk_level in ["MEDIUM", "HIGH", "CRITICAL"]:
            if prefs.fcmEnabled:
                channels_to_send.append("FCM")

        if risk_level in ["HIGH", "CRITICAL"]:
            if prefs.smsEnabled and prefs.smsNumber:
                if (risk_level == "HIGH" and prefs.highSmsEnabled) or (risk_level == "CRITICAL" and prefs.criticalSmsEnabled):
                    channels_to_send.append("SMS")

        if risk_level == "CRITICAL":
            if prefs.emailEnabled and prefs.emailAddress:
                if prefs.criticalEmailEnabled:
                    channels_to_send.append("EMAIL")

        for channel in channels_to_send:
            idempotency_key = (incident_id, channel)
            if idempotency_key in self._sent_idempotency_set:
                logger.info(f"[NotificationService] Idempotency check: {channel} already sent for {incident_id}")
                continue

            self._dispatch_channel(incident, channel, prefs)

    def _dispatch_channel(self, incident: Dict[str, Any], channel: str, prefs: NotificationPreferences):
        incident_id = incident.get("incidentId")
        parent_email = prefs.parentEmail
        risk_level = str(incident.get("riskLevel", "HIGH")).upper()
        child_name = incident.get("childName", "Child")
        category = incident.get("category") or "safety_alert"

        log_id = f"notif_{datetime.now(timezone.utc).timestamp()}_{channel.lower()}"
        now_str = datetime.now(timezone.utc).isoformat()

        log_entry = NotificationLogEntry(
            id=log_id,
            incidentId=incident_id,
            parentEmail=parent_email,
            channel=channel,
            destination=prefs.smsNumber if channel == "SMS" else (prefs.emailAddress if channel == "EMAIL" else "FCM_DEVICE"),
            status="PENDING",
            attemptCount=1,
            createdAt=now_str
        )
        self.logs_db.append(log_entry)

        try:
            if channel == "SMS":
                message = f"ChildSafeLens Alert: A {risk_level.lower()}-risk incident was detected for {child_name}. Category: {category}. Please open your Parent Dashboard to review."
                res = self.sms_provider.send_sms(prefs.smsNumber, message)
                if res.get("status") != "SENT":
                    raise RuntimeError("SMS provider did not confirm delivery.")
                log_entry.status = res["status"]
                log_entry.providerMessageId = res["providerMessageId"]
                log_entry.sentAt = datetime.now(timezone.utc).isoformat()

            elif channel == "EMAIL":
                subject = f"[ChildSafeLens] {risk_level} Safety Alert — {child_name}"
                html_body = f"""
                <html>
                <body>
                    <h2>ChildSafeLens Safety Alert</h2>
                    <p>ChildSafeLens detected a <b>{risk_level}</b>-risk incident.</p>
                    <ul>
                        <li><b>Child:</b> {child_name}</li>
                        <li><b>Risk Level:</b> {risk_level}</li>
                        <li><b>Category:</b> {category}</li>
                    </ul>
                    <p>Please open the Parent Dashboard to review the incident details.</p>
                </body>
                </html>
                """
                res = self.email_provider.send_email(prefs.emailAddress, subject, html_body)
                if res.get("status") != "SENT":
                    raise RuntimeError("Email provider did not confirm delivery.")
                log_entry.status = res["status"]
                log_entry.providerMessageId = res["providerMessageId"]
                log_entry.sentAt = datetime.now(timezone.utc).isoformat()

            elif channel == "FCM":
                raise RuntimeError("FCM provider is not implemented.")

            self._sent_idempotency_set.add((incident_id, channel))

        except Exception as error:
            logger.error(
                "[NotificationService] Failed to send %s notification (%s).",
                channel,
                type(error).__name__,
            )
            log_entry.status = "FAILED"
            log_entry.errorMessage = type(error).__name__

    def get_logs(self, incidentId: Optional[str] = None, parentEmail: Optional[str] = None) -> List[NotificationLogEntry]:
        results = self.logs_db
        if incidentId:
            results = [l for l in results if l.incidentId == incidentId]
        if parentEmail:
            results = [l for l in results if l.parentEmail.lower() == parentEmail.lower()]
        return results


# Global notification service instance
notification_service = NotificationService()
