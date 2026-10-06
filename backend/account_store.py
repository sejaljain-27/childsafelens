"""Persistent parent accounts and child profiles shared by Android and web."""

import hashlib
import hmac
import json
import os
import secrets
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping


_PASSWORD_ITERATIONS = 310_000
_DATABASE_PATH = Path(
    os.environ.get(
        "CHILDSAFELENS_ACCOUNT_DB",
        Path(__file__).parent / "data" / "accounts.sqlite3",
    )
)


class AccountStore:
    def __init__(self, database_path: Path = _DATABASE_PATH):
        self.database_path = Path(database_path)
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as connection:
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS parent_accounts (
                    email TEXT PRIMARY KEY,
                    full_name TEXT NOT NULL,
                    password_salt BLOB NOT NULL,
                    password_hash BLOB NOT NULL
                )
                """
            )
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS child_profiles (
                    child_id TEXT PRIMARY KEY,
                    parent_email TEXT NOT NULL REFERENCES parent_accounts(email),
                    child_name TEXT NOT NULL,
                    UNIQUE(parent_email, child_name)
                )
                """
            )
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS incident_records (
                    incident_id TEXT PRIMARY KEY,
                    parent_email TEXT NOT NULL,
                    child_id TEXT NOT NULL,
                    child_name TEXT NOT NULL,
                    occurred_at INTEGER NOT NULL,
                    status TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """
            )
            connection.execute(
                """
                CREATE INDEX IF NOT EXISTS incident_records_parent_child_time
                ON incident_records(parent_email, child_id, occurred_at)
                """
            )
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS risk_events (
                    event_id TEXT PRIMARY KEY,
                    risk_level TEXT NOT NULL,
                    occurred_at TEXT NOT NULL,
                    payload_json TEXT NOT NULL
                )
                """
            )

    @contextmanager
    def _connect(self):
        connection = sqlite3.connect(self.database_path, timeout=10)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("PRAGMA busy_timeout = 10000")
        try:
            yield connection
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    @staticmethod
    def normalize_email(email: str) -> str:
        return email.strip().casefold()

    @staticmethod
    def _hash_password(password: str, salt: bytes) -> bytes:
        return hashlib.pbkdf2_hmac(
            "sha256", password.encode("utf-8"), salt, _PASSWORD_ITERATIONS
        )

    def create_account(self, email: str, password: str, full_name: str) -> bool:
        normalized_email = self.normalize_email(email)
        salt = secrets.token_bytes(16)
        password_hash = self._hash_password(password, salt)
        with self._connect() as connection:
            cursor = connection.execute(
                """
                INSERT OR IGNORE INTO parent_accounts
                    (email, full_name, password_salt, password_hash)
                VALUES (?, ?, ?, ?)
                """,
                (normalized_email, full_name.strip(), salt, password_hash),
            )
            return cursor.rowcount == 1

    def verify_credentials(self, email: str, password: str) -> bool:
        with self._connect() as connection:
            account = connection.execute(
                "SELECT password_salt, password_hash FROM parent_accounts WHERE email = ?",
                (self.normalize_email(email),),
            ).fetchone()
        if account is None:
            return False
        candidate = self._hash_password(password, account["password_salt"])
        return hmac.compare_digest(candidate, account["password_hash"])

    def has_account(self, email: str) -> bool:
        with self._connect() as connection:
            account = connection.execute(
                "SELECT 1 FROM parent_accounts WHERE email = ?",
                (self.normalize_email(email),),
            ).fetchone()
        return account is not None

    def add_child_profile(self, email: str, child_name: str) -> dict:
        normalized_email = self.normalize_email(email)
        normalized_name = child_name.strip()
        with self._connect() as connection:
            existing = connection.execute(
                """
                SELECT child_id, parent_email, child_name FROM child_profiles
                WHERE parent_email = ? AND lower(child_name) = lower(?)
                """,
                (normalized_email, normalized_name),
            ).fetchone()
            if existing is not None:
                return dict(existing)

            child_id = secrets.token_urlsafe(16)
            connection.execute(
                """
                INSERT INTO child_profiles (child_id, parent_email, child_name)
                VALUES (?, ?, ?)
                """,
                (child_id, normalized_email, normalized_name),
            )
            return {
                "child_id": child_id,
                "parent_email": normalized_email,
                "child_name": normalized_name,
            }

    def list_child_profiles(self, email: str) -> list[dict]:
        with self._connect() as connection:
            profiles = connection.execute(
                """
                SELECT child_id, parent_email, child_name FROM child_profiles
                WHERE parent_email = ? ORDER BY child_name COLLATE NOCASE
                """,
                (self.normalize_email(email),),
            ).fetchall()
        return [dict(profile) for profile in profiles]

    def save_incident(self, incident: Mapping[str, Any]) -> None:
        incident_id = str(incident["incidentId"])
        parent_email = self.normalize_email(str(incident["parentEmail"]))
        child_id = str(incident["childId"])
        child_name = str(incident["childName"])
        occurred_at = int(incident["timestamp"])
        status = str(incident["status"])
        payload = dict(incident)
        payload["parentEmail"] = parent_email
        now = datetime.now(timezone.utc).isoformat()
        payload_json = json.dumps(payload, ensure_ascii=False, allow_nan=False)
        with self._connect() as connection:
            existing = connection.execute(
                "SELECT parent_email, created_at FROM incident_records WHERE incident_id = ?",
                (incident_id,),
            ).fetchone()
            if (
                existing is not None
                and existing["parent_email"] != parent_email
            ):
                raise ValueError("Incident ID is already owned by another parent.")
            created_at = existing["created_at"] if existing is not None else now
            connection.execute(
                """
                INSERT INTO incident_records (
                    incident_id, parent_email, child_id, child_name, occurred_at,
                    status, payload_json, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(incident_id) DO UPDATE SET
                    child_id = excluded.child_id,
                    child_name = excluded.child_name,
                    occurred_at = excluded.occurred_at,
                    status = excluded.status,
                    payload_json = excluded.payload_json,
                    updated_at = excluded.updated_at
                """,
                (
                    incident_id,
                    parent_email,
                    child_id,
                    child_name,
                    occurred_at,
                    status,
                    payload_json,
                    created_at,
                    now,
                ),
            )

    def get_incident(self, incident_id: str) -> dict | None:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT payload_json FROM incident_records WHERE incident_id = ?",
                (incident_id,),
            ).fetchone()
        return json.loads(row["payload_json"]) if row is not None else None

    def list_incidents(
        self,
        parent_email: str | None = None,
        child_id: str | None = None,
        child_name: str | None = None,
    ) -> list[dict]:
        clauses = []
        parameters: list[str] = []
        if parent_email is not None:
            clauses.append("parent_email = ?")
            parameters.append(self.normalize_email(parent_email))
        if child_id is not None:
            clauses.append("child_id = ?")
            parameters.append(child_id)
        if child_name is not None:
            clauses.append("child_name = ? COLLATE NOCASE")
            parameters.append(child_name)
        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        with self._connect() as connection:
            rows = connection.execute(
                f"""
                SELECT payload_json FROM incident_records
                {where}
                ORDER BY occurred_at, incident_id
                """,
                parameters,
            ).fetchall()
        return [json.loads(row["payload_json"]) for row in rows]

    def save_risk_event(self, event: Mapping[str, Any]) -> None:
        event_id = str(event["event_id"])
        risk_level = str(event["risk_level"])
        occurred_at = str(event["timestamp"])
        payload_json = json.dumps(dict(event), ensure_ascii=False, allow_nan=False)
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO risk_events (event_id, risk_level, occurred_at, payload_json)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(event_id) DO UPDATE SET
                    risk_level = excluded.risk_level,
                    occurred_at = excluded.occurred_at,
                    payload_json = excluded.payload_json
                """,
                (event_id, risk_level, occurred_at, payload_json),
            )

    def list_risk_events(self) -> list[dict]:
        with self._connect() as connection:
            rows = connection.execute(
                "SELECT payload_json FROM risk_events ORDER BY occurred_at, event_id"
            ).fetchall()
        return [json.loads(row["payload_json"]) for row in rows]

    def clear_incidents_and_risk_events(self) -> None:
        with self._connect() as connection:
            connection.execute("DELETE FROM incident_records")
            connection.execute("DELETE FROM risk_events")


account_store = AccountStore()
