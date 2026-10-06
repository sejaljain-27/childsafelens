import tempfile
import unittest
from pathlib import Path

from account_store import AccountStore


class AccountStoreTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.store = AccountStore(Path(self.temp_dir.name) / "accounts.sqlite3")

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_parent_credentials_are_case_insensitive_by_email_and_password_checked(self):
        self.assertTrue(
            self.store.create_account(" Parent@Example.com ", "correct-horse", "Parent")
        )
        self.assertTrue(self.store.verify_credentials("parent@example.com", "correct-horse"))
        self.assertFalse(self.store.verify_credentials("parent@example.com", "wrong"))
        self.assertFalse(self.store.create_account("parent@example.com", "other", "Other"))

    def test_child_profiles_are_isolated_by_parent_and_idempotent(self):
        self.store.create_account("first@example.com", "password", "First")
        self.store.create_account("second@example.com", "password", "Second")

        first = self.store.add_child_profile("first@example.com", "Casey")
        same = self.store.add_child_profile("FIRST@example.com", "casey")
        self.store.add_child_profile("second@example.com", "Jordan")

        self.assertEqual(first["child_id"], same["child_id"])
        self.assertEqual(
            [profile["child_name"] for profile in self.store.list_child_profiles("FIRST@example.com")],
            ["Casey"],
        )
        self.assertEqual(
            [profile["child_name"] for profile in self.store.list_child_profiles("second@example.com")],
            ["Jordan"],
        )

    def test_incidents_and_risk_events_survive_store_reopen_with_parent_scope(self):
        incident = {
            "incidentId": "incident-1",
            "parentEmail": "Parent@One.example",
            "childId": "child-one",
            "childName": "Casey",
            "timestamp": 1_791_138_000_000,
            "status": "PENDING_PARENT_REVIEW",
            "messageSnippet": "a short retained snippet",
            "evidenceReference": "opaque_reference_123456",
            "CRS": None,
        }
        event = {
            "event_id": "event-1",
            "risk_level": "high_risk",
            "timestamp": "2026-10-05T00:00:00+00:00",
            "model_status": "real",
            "model_version": "test-model",
            "development_simulation": False,
        }

        self.store.save_incident(incident)
        self.store.save_risk_event(event)
        reopened = AccountStore(self.store.database_path)

        self.assertEqual(
            reopened.get_incident("incident-1")["parentEmail"],
            "parent@one.example",
        )
        self.assertEqual(
            [item["incidentId"] for item in reopened.list_incidents(
                parent_email="PARENT@ONE.EXAMPLE",
                child_id="child-one",
            )],
            ["incident-1"],
        )
        self.assertEqual(reopened.list_incidents(parent_email="other@example.com"), [])
        self.assertEqual(reopened.list_risk_events(), [event])

        persisted_update = reopened.get_incident("incident-1")
        persisted_update["status"] = "ALLOWED"
        persisted_update["parentDecision"] = "ALLOW"
        reopened.save_incident(persisted_update)
        self.assertEqual(
            self.store.get_incident("incident-1")["parentDecision"],
            "ALLOW",
        )

    def test_incident_id_cannot_be_reassigned_to_a_different_parent(self):
        base = {
            "incidentId": "shared-id",
            "parentEmail": "first@example.com",
            "childId": "child-one",
            "childName": "Casey",
            "timestamp": 1_791_138_000_000,
            "status": "PENDING_PARENT_REVIEW",
        }
        self.store.save_incident(base)
        attempted_reassignment = {**base, "parentEmail": "second@example.com"}

        with self.assertRaisesRegex(ValueError, "owned by another parent"):
            self.store.save_incident(attempted_reassignment)

        self.assertEqual(
            self.store.get_incident("shared-id")["parentEmail"],
            "first@example.com",
        )


if __name__ == "__main__":
    unittest.main()
