"""Tests for GET/PUT/DELETE /api/v1/health-profile and personalized /predict."""

import os
import time
from unittest.mock import MagicMock, patch

import jwt as pyjwt
import pytest
from fastapi.testclient import TestClient

from backend.api.app import app
from backend.api.v1.router import get_feature_pipeline
from backend.config.pollutants import tightened_category

INTERNAL = {"X-API-Key": os.environ["MFRAMAPA_INTERNAL_KEY"]}


def _token(secret: str, **claims):
    payload = {"sub": "user-123", "aud": "authenticated", "exp": int(time.time()) + 3600, **claims}
    return pyjwt.encode(payload, secret, algorithm="HS256")


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def bearer(monkeypatch):
    secret = "test-jwt-secret"
    monkeypatch.setenv("SUPABASE_JWT_SECRET", secret)
    return {"Authorization": f"Bearer {_token(secret)}"}


def test_health_profile_requires_sign_in(client):
    assert client.get("/api/v1/health-profile").status_code == 401
    assert client.put("/api/v1/health-profile", json={}).status_code == 401
    assert client.delete("/api/v1/health-profile").status_code == 401


def test_get_health_profile_empty_shell_when_unset(client, bearer):
    with patch("backend.api.v1.router.profile_store.get_profile", return_value=None):
        r = client.get("/api/v1/health-profile", headers=bearer)
        assert r.status_code == 200
        data = r.json()
        assert data["health_conditions"] == []
        assert data["home_location"] is None


def test_put_health_profile_saves_and_strips_unknown_fields(client, bearer):
    mock_upsert = MagicMock(return_value={"user_id": "user-123"})
    with patch("backend.api.v1.router.profile_store.upsert_profile", mock_upsert):
        r = client.put(
            "/api/v1/health-profile",
            headers=bearer,
            json={
                "health_conditions": ["asthma"],
                "home_location": {"name": "Accra", "lat": 5.6, "lon": -0.19},
                "not_a_real_field": "should be dropped by the pydantic model",
            },
        )
        assert r.status_code == 200
        assert r.json()["status"] == "saved"
        called_fields = mock_upsert.call_args[0][1]
        assert called_fields["health_conditions"] == ["asthma"]
        assert "not_a_real_field" not in called_fields


def test_put_health_profile_save_failure_is_502(client, bearer):
    with patch("backend.api.v1.router.profile_store.upsert_profile", return_value=None):
        r = client.put("/api/v1/health-profile", headers=bearer, json={"health_conditions": []})
        assert r.status_code == 502


def test_delete_health_profile(client, bearer):
    with patch("backend.api.v1.router.profile_store.delete_profile", return_value=True) as m:
        r = client.delete("/api/v1/health-profile", headers=bearer)
        assert r.status_code == 200
        assert r.json()["status"] == "deleted"
        m.assert_called_once_with("user-123")


# ── tightened_category() ────────────────────────────────────────────────────

def test_tightened_category_no_conditions_returns_none():
    assert tightened_category("Moderate", []) is None
    assert tightened_category("Moderate", None) is None


def test_tightened_category_non_sensitizing_condition_returns_none():
    assert tightened_category("Moderate", ["some_unlisted_condition"]) is None


def test_tightened_category_asthma_moves_up_one_tier():
    result = tightened_category("Moderate", ["asthma"])
    assert result["category"] == "Unhealthy for Sensitive Groups"


def test_tightened_category_already_worst_tier_returns_none():
    assert tightened_category("Hazardous", ["asthma"]) is None


# ── /predict personalization ────────────────────────────────────────────────

def test_predict_includes_personalized_block_for_sensitized_signed_in_user(client, bearer):
    mock_pipeline = MagicMock()
    mock_pipeline.get_features.return_value = {"pm25_surface": 20.0}  # -> Moderate
    app.dependency_overrides[get_feature_pipeline] = lambda: mock_pipeline
    try:
        with patch(
            "backend.api.v1.router.profile_store.get_profile",
            return_value={"health_conditions": ["asthma"]},
        ):
            r = client.get(
                "/api/v1/predict", params={"lat": 5.6, "lon": -0.19}, headers=bearer
            )
            assert r.status_code == 200
            data = r.json()
            assert data["personalized"] is not None
            assert data["personalized"]["category"] != data["aqi_category"]
    finally:
        app.dependency_overrides.clear()


def test_predict_personalized_is_none_for_anonymous_caller(client):
    mock_pipeline = MagicMock()
    mock_pipeline.get_features.return_value = {"pm25_surface": 20.0}
    app.dependency_overrides[get_feature_pipeline] = lambda: mock_pipeline
    try:
        r = client.get("/api/v1/predict", params={"lat": 5.6, "lon": -0.19})
        assert r.status_code == 200
        assert r.json()["personalized"] is None
    finally:
        app.dependency_overrides.clear()
