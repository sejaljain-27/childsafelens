import unittest
from unittest.mock import patch

import main
from notification_service import (
    EmailProvider,
    NotificationPreferences,
    NotificationService,
    SmsProvider,
)


class NotificationProviderTests(unittest.TestCase):
    def test_notification_preferences_do_not_include_demo_destinations(self):
        preferences = NotificationPreferences(parentEmail="parent@example.com")

        self.assertIsNone(preferences.smsNumber)
        self.assertIsNone(preferences.emailAddress)

    def test_unconfigured_sms_provider_does_not_report_success(self):
        provider = SmsProvider()

        with patch.object(provider, "account_sid", ""), patch.object(
            provider, "auth_token", ""
        ), patch.object(provider, "from_number", ""):
            with self.assertRaisesRegex(RuntimeError, "not configured"):
                provider.send_sms("+10000000000", "test")

    def test_configured_sms_delivery_failure_is_not_suppressed(self):
        provider = SmsProvider()
        with patch.object(provider, "account_sid", "AC-test"), patch.object(
            provider, "auth_token", "test-token"
        ), patch.object(provider, "from_number", "+10000000000"), patch(
            "notification_service.urllib.request.urlopen",
            side_effect=OSError("network error"),
        ):
            with self.assertRaisesRegex(RuntimeError, "delivery failed"):
                provider.send_sms("+10000000000", "test")

    def test_unconfigured_email_provider_does_not_report_success(self):
        provider = EmailProvider()
        with patch.object(provider, "smtp_user", ""), patch.object(
            provider, "smtp_password", ""
        ):
            with self.assertRaisesRegex(RuntimeError, "not configured"):
                provider.send_email("parent@example.com", "test", "test")

    def test_configured_email_delivery_failure_is_not_suppressed(self):
        provider = EmailProvider()
        with patch.object(provider, "smtp_user", "user"), patch.object(
            provider, "smtp_password", "test-password"
        ), patch("notification_service.smtplib.SMTP", side_effect=OSError("network error")):
            with self.assertRaisesRegex(RuntimeError, "delivery failed"):
                provider.send_email("parent@example.com", "test", "test")

    def test_notification_service_records_placeholder_fcm_as_failed(self):
        service = NotificationService()
        preferences = NotificationPreferences(
            parentEmail="parent@example.com",
            fcmEnabled=True,
            smsEnabled=False,
            emailEnabled=False,
        )

        service._dispatch_channel(
            {"incidentId": "incident-1", "riskLevel": "HIGH"},
            "FCM",
            preferences,
        )

        self.assertEqual(service.logs_db[0].status, "FAILED")
        self.assertEqual(service.logs_db[0].errorMessage, "RuntimeError")
        self.assertNotIn(("incident-1", "FCM"), service._sent_idempotency_set)

    def test_notification_service_does_not_accept_unconfirmed_sms_as_sent(self):
        service = NotificationService()
        preferences = NotificationPreferences(
            parentEmail="parent@example.com",
            smsNumber="+10000000000",
        )
        with patch.object(
            service.sms_provider,
            "send_sms",
            return_value={"status": "FAILED", "providerMessageId": None},
        ):
            service._dispatch_channel(
                {"incidentId": "incident-2", "riskLevel": "HIGH"},
                "SMS",
                preferences,
            )

        self.assertEqual(service.logs_db[0].status, "FAILED")
        self.assertNotIn(("incident-2", "SMS"), service._sent_idempotency_set)

    def test_alert_endpoint_does_not_report_delivery_when_providers_are_unconfigured(self):
        request = main.AlertRequest(
            deviceId="device",
            type="INCOMING_BULLYING",
            appPackage="com.childsafelens.demo",
            score=0.5,
            timestamp=1_700_000_000_000,
            parentEmail="parent@example.com",
            parentPhone="+10000000000",
        )
        with patch.dict("os.environ", {"API_KEY": "test-only-secret"}), patch.object(
            main.notification_service.email_provider,
            "send_email",
            side_effect=RuntimeError("Email provider is not configured."),
        ), patch.object(
            main.notification_service.sms_provider,
            "send_sms",
            side_effect=RuntimeError("SMS provider is not configured."),
        ):
            with self.assertRaises(main.HTTPException) as error:
                main.post_alert(request, x_api_key="test-only-secret")

        self.assertEqual(error.exception.status_code, 502)


if __name__ == "__main__":
    unittest.main()
