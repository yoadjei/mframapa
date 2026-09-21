"""Tests for /api/v1/saved-locations sync and the push_tokens threshold schema."""

import os
import tempfile
import time
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from backend.alerts.storage import PushTokenStore
from backend.api.app import app
from backend.api.v1.router import get_push_store

INTERNAL = {"X-API-Key": os.environ["MFRAMAPA_INTERNAL_KEY"]}


@pytest.fixture
def client():
    return TestClient(app)


# ── /api/v1/saved-locations ─────────────────────────────────────────────────

def test_saved_locations_requires_sign_in(client):
    assert client.get("/api/v1/saved-locations").status_code == 401
    assert client.post("/api/v1/saved-locations", json={"name": "Accra", "lat": 5.6, "lon": -0.19}).status_code == 401
    assert client.delete("/api/v1/saved-locations/Accra").status_code == 401


def test_list_saved_locations_returns_empty_when_unconfigured(client):
    import time as _t
    import jwt as pyjwt

    secret = "test-jwt-secret"
    with patch.dict(os.environ, {"SUPABASE_JWT_SECRET": secret}):
        token = pyjwt.encode(
            {"sub": "user-123", "aud": "authenticated", "exp": int(_t.time()) + 3600}, secret, algorithm="HS256"
        )
        r = client.get("/api/v1/saved-locations", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200
        assert r.json() == {"locations": []}


# ── push_tokens schema migration ────────────────────────────────────────────

def test_push_token_store_migrates_existing_db_with_new_columns():
    with tempfile.TemporaryDirectory() as d:
        db_path = os.path.join(d, "push.db")
        # simulate a pre-migration db: create the old-shape table directly
        import sqlite3
        with sqlite3.connect(db_path) as conn:
            conn.execute(
                "CREATE TABLE push_tokens (token TEXT PRIMARY KEY, platform TEXT NOT NULL, "
                "lat REAL NOT NULL, lon REAL NOT NULL, updated_at REAL NOT NULL)"
            )
            conn.execute(
                "INSERT INTO push_tokens VALUES (?, ?, ?, ?, ?)",
                ("old-token", "web", 5.6, -0.19, time.time()),
            )

        # opening the store must add the new columns without losing the row
        store = PushTokenStore(db_path)
        with sqlite3.connect(db_path) as conn:
            cols = {row[1] for row in conn.execute("PRAGMA table_info(push_tokens)")}
            assert {"user_id", "threshold_offset"} <= cols
            row = conn.execute("SELECT token FROM push_tokens WHERE token='old-token'").fetchone()
            assert row is not None


def test_push_token_store_register_persists_user_id_and_threshold():
    with tempfile.TemporaryDirectory() as d:
        store = PushTokenStore(os.path.join(d, "push.db"))
        store.register("tok-1", "web", 5.6, -0.19, user_id="user-abc", threshold_offset=-15.0)
        import sqlite3
        with sqlite3.connect(store.db_path) as conn:
            row = conn.execute(
                "SELECT user_id, threshold_offset FROM push_tokens WHERE token='tok-1'"
            ).fetchone()
        assert row == ("user-abc", -15.0)


def test_register_push_token_route_still_works_anonymously(client):
    with tempfile.TemporaryDirectory() as d:
        store = PushTokenStore(os.path.join(d, "push.db"))
        app.dependency_overrides[get_push_store] = lambda: store
        try:
            r = client.post(
                "/api/v1/register-push-token",
                json={"token": "anon-tok", "platform": "web", "lat": 5.6, "lon": -0.19},
            )
            assert r.status_code == 200
        finally:
            app.dependency_overrides.clear()
