"""FastAPI /api routes (predict uncertainty, resolve-location)."""

from unittest.mock import MagicMock
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from backend.api.app import app
from backend.api.v1.router import get_feature_pipeline
from backend.pipeline.feature_pipeline import FeaturePipeline


@pytest.fixture
def client():
    # Provide the default API Key for tests to pass
    return TestClient(app, headers={"X-API-Key": "mframapa-internal-dev-key"})


def test_health(client):
    r = client.get("/api/v1/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_resolve_location_found(client):
    r = client.get("/api/v1/resolve-location", params={"city": "Lagos"})
    assert r.status_code == 200
    data = r.json()
    assert "lat" in data and "lon" in data
    assert "Lagos" in data["name"]


def test_resolve_location_missing(client):
    r = client.get("/api/v1/resolve-location", params={"city": "NonexistentCityXyz123"})
    assert r.status_code == 404


def test_predict_returns_uncertainty(client):
    mock_pipeline = MagicMock()
    mock_pipeline.get_features.return_value = {
        "pm25_surface": 40.0,
        "temperature_2m": 30.0,
        "relative_humidity": 70.0,
        "u_component_of_wind_10m": 1.0,
        "v_component_of_wind_10m": 0.5,
        "no2_tropospheric_column": 1e-5,
        "aerosol_optical_depth": 0.3,
        "pm10_surface": 50.0,
        "population_density": 1200.0,
        "elevation": 100.0,
    }

    app.dependency_overrides[get_feature_pipeline] = lambda: mock_pipeline
    try:
        r = client.get(
            "/api/v1/predict",
            params={"lat": 5.6, "lon": -0.19, "name": "Accra", "day": "2024-06-01"},
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["pm25"] > 0
        assert "uncertainty" in data
        assert data["uncertainty"]["pm25_lower"] < data["pm25"]
        assert data["uncertainty"]["pm25_upper"] > data["pm25"]
        assert data["model"]["region_id"]
        assert data["model"]["segment"] in ("urban", "rural")
    finally:
        app.dependency_overrides.clear()


def test_predict_returns_pollutants_array(client):
    mock_pipeline = MagicMock()
    mock_pipeline.get_features.return_value = {
        "pm25_surface": 40.0,
        "pm10_surface": 60.0,
        "no2_surface": 30.0,
        "o3_surface": 120.0,
        "so2_surface": 10.0,
        "co_surface": 500.0,
        "temperature_2m": 30.0,
    }
    app.dependency_overrides[get_feature_pipeline] = lambda: mock_pipeline
    try:
        r = client.get(
            "/api/v1/predict",
            params={"lat": 5.6, "lon": -0.19, "name": "Accra", "day": "2024-06-01"},
        )
        assert r.status_code == 200, r.text
        data = r.json()
        pollutants = data["pollutants"]
        codes = {p["code"] for p in pollutants}
        assert codes == {"pm25", "pm10", "no2", "o3", "so2", "co"}
        # sorted most-dangerous-first
        pcts = [p["pct_of_limit"] for p in pollutants]
        assert pcts == sorted(pcts, reverse=True)
        for p in pollutants:
            assert p["severity"] in ("good", "moderate", "high", "severe", "hazardous", "unknown")
            assert "who_limit" in p and "unit" in p
        pm25_entry = next(p for p in pollutants if p["code"] == "pm25")
        assert pm25_entry["cigarette_equivalent"] is not None
        assert "comparison" in data  # present (may be None without a warm week-avg cache)
    finally:
        app.dependency_overrides.clear()


def test_pollutant_info_route(client):
    r = client.get("/api/v1/pollutant-info")
    assert r.status_code == 200
    data = r.json()["pollutants"]
    for code in ("pm25", "pm10", "no2", "o3", "so2", "co"):
        assert code in data
        assert data[code]["what_it_is"]
        assert data[code]["citations"]


def test_generate_insight(client):
    r = client.post(
        "/api/v1/generate-insight",
        json={"pm25": 80, "aqi_category": "Unhealthy", "weather": {}, "language": "en"},
    )
    assert r.status_code == 200
    assert "insight" in r.json()


def test_predict_out_of_range_lat(client):
    r = client.get("/api/v1/predict", params={"lat": 99.0, "lon": 0.0})
    assert r.status_code == 422


def test_predict_out_of_range_lon(client):
    r = client.get("/api/v1/predict", params={"lat": 0.0, "lon": 200.0})
    assert r.status_code == 422


def test_predict_missing_params(client):
    r = client.get("/api/v1/predict", params={"lon": 0.0})
    assert r.status_code == 422


def test_predict_aqi_category_matches_pm25(client):
    mock_pipeline = MagicMock()
    mock_pipeline.get_features.return_value = {"pm25_surface": 8.0}
    app.dependency_overrides[get_feature_pipeline] = lambda: mock_pipeline
    try:
        r = client.get("/api/v1/predict", params={"lat": 5.6, "lon": -0.19})
        assert r.status_code == 200
        data = r.json()
        from backend.api.aqi import aqi_category_from_pm25
        assert data["aqi_category"] == aqi_category_from_pm25(data["pm25"])
    finally:
        app.dependency_overrides.clear()


def test_predict_fallback_when_pm25_missing(client):
    mock_pipeline = MagicMock()
    mock_pipeline.get_features.return_value = {}
    app.dependency_overrides[get_feature_pipeline] = lambda: mock_pipeline
    try:
        r = client.get("/api/v1/predict", params={"lat": 5.6, "lon": -0.19})
        assert r.status_code == 200
        assert r.json()["pm25"] > 0
    finally:
        app.dependency_overrides.clear()


def test_resolve_location_empty_query(client):
    r = client.get("/api/v1/resolve-location", params={"city": ""})
    assert r.status_code == 422


def test_generate_insight_hazardous(client):
    r = client.post(
        "/api/v1/generate-insight",
        json={"pm25": 200.0, "aqi_category": "Hazardous", "weather": {}, "language": "en"},
    )
    assert r.status_code == 200
    # guidance is now a reviewed line, so assert it is one of the real hazardous
    # variants rather than guessing at keywords (which the hash-based selection
    # made brittle).
    from backend.api.insights import variants, DRY, RAINY, HARMATTAN
    hazardous = set(variants("hazardous", DRY)) | set(variants("hazardous", RAINY)) | set(variants("hazardous", HARMATTAN))
    assert r.json()["insight"] in hazardous


def test_generate_insight_negative_pm25(client):
    r = client.post("/api/v1/generate-insight", json={"pm25": -1.0})
    assert r.status_code == 422


def test_translate_without_gemini_returns_fallback(client):
    r = client.post(
        "/api/v1/translate",
        json={
            "strings": {"home.title": "Mframapa", "aqi.good": "Good"},
            "target_language": "fr",
        },
    )
    assert r.status_code == 200
    data = r.json()
    assert data["fallback"] is True
    assert data["translations"]["home.title"] == "Mframapa"


def test_translate_same_language(client):
    r = client.post(
        "/api/v1/translate",
        json={"strings": {"aqi.good": "Good"}, "target_language": "en"},
    )
    assert r.status_code == 200
    assert r.json()["translations"]["aqi.good"] == "Good"
    assert r.json()["fallback"] is False


@patch("backend.api.v1.router.gemini_client.translate_strings")
def test_translate_with_gemini(mock_translate, client):
    mock_translate.return_value = {"aqi.good": "Bon"}
    with patch("backend.api.v1.router.gemini_client.is_available", return_value=True):
        r = client.post(
            "/api/v1/translate",
            json={"strings": {"aqi.good": "Good"}, "target_language": "fr"},
        )
    assert r.status_code == 200
    assert r.json()["translations"]["aqi.good"] == "Bon"
    assert r.json()["provider"] == "gemini"


@patch("backend.api.v1.router.gemini_client.translate_strings")
def test_generate_insight_translates_the_reviewed_lines(mock_translate, client):
    """guidance is no longer written by the model, only translated by it."""
    mock_translate.side_effect = lambda mapping, **_k: {k: f"fr {k}" for k in mapping}
    with patch("backend.api.v1.router.gemini_client.is_available", return_value=True):
        r = client.post(
            "/api/v1/generate-insight",
            json={
                "pm25": 80,
                "aqi_category": "Unhealthy",
                "weather": {},
                "language": "fr",
            },
        )
    assert r.status_code == 200
    assert r.json()["insight"].startswith("fr ")


def test_batch_predict_success(client):
    mock_pipeline = MagicMock()
    mock_pipeline.get_features.return_value = {
        "pm25_surface": 22.0,
        "temperature_2m": 27.0,
        "relative_humidity": 60.0,
        "u_component_of_wind_10m": 1.0,
        "v_component_of_wind_10m": 1.0,
        "population_density": 900.0,
    }
    app.dependency_overrides[get_feature_pipeline] = lambda: mock_pipeline
    try:
        r = client.post(
            "/api/v1/batch-predict",
            json={
                "locations": [
                    {"lat": 5.6, "lon": -0.19, "name": "Accra"},
                    {"lat": 6.52, "lon": 3.37, "name": "Lagos"},
                ]
            },
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["count"] == 2
        assert data["success_count"] == 2
        assert data["error_count"] == 0
        assert len(data["results"]) == 2
    finally:
        app.dependency_overrides.clear()


def test_inference_fallbacks_are_marked_degraded():
    """Users must never see a constant/OpenMeteo-only reading as a normal model hit."""
    from backend.api.v1.router import _run_inference

    class _Req:
        class app:
            class state:
                models = {}

    _, _, degraded_om, src_om, _ = _run_inference(_Req(), {}, "west_africa", "urban", 40.0)
    assert degraded_om is True
    assert src_om == "openmeteo_fallback"

    _, _, degraded_c, src_c, _ = _run_inference(_Req(), {}, "west_africa", "urban", None)
    assert degraded_c is True
    assert src_c == "fallback_constant"


def test_batch_predict_enforces_cap(client):
    payload = {
        "locations": [
            {"lat": 0.1, "lon": 0.2, "name": f"City-{idx}"}
            for idx in range(21)
        ]
    }
    r = client.post("/api/v1/batch-predict", json=payload)
    assert r.status_code == 422


def test_predict_response_compression(client):
    mock_pipeline = MagicMock()
    mock_pipeline.get_features.return_value = {
        "pm25_surface": 45.0,
        "temperature_2m": 30.0,
        "relative_humidity": 65.0,
        "u_component_of_wind_10m": 2.0,
        "v_component_of_wind_10m": 2.0,
        "population_density": 1400.0,
        "no2_tropospheric_column": 1e-5,
        "aerosol_optical_depth": 0.3,
        "pm10_surface": 52.0,
        "elevation": 90.0,
    }
    app.dependency_overrides[get_feature_pipeline] = lambda: mock_pipeline
    try:
        r = client.get(
            "/api/v1/predict",
            params={"lat": 5.6, "lon": -0.19, "name": "Accra"},
            headers={"Accept-Encoding": "gzip"},
        )
        assert r.status_code == 200
        assert r.headers.get("content-encoding") == "gzip"
    finally:
        app.dependency_overrides.clear()


def test_ingest_to_predict_smoke(client):
    with patch("backend.pipeline.feature_pipeline.DataOrchestrator") as mock_orchestrator_cls, patch(
        "backend.pipeline.feature_pipeline.WorldPopDataSource"
    ) as mock_worldpop_cls, patch("backend.pipeline.feature_pipeline.SRTMDataSource") as mock_srtm_cls:
        mock_orchestrator_cls.return_value.get_features.return_value = {
            "pm25_surface": 18.0,
            "temperature_2m": 27.2,
            "relative_humidity": 63.0,
            "u_component_of_wind_10m": 0.8,
            "v_component_of_wind_10m": 1.1,
            "aerosol_optical_depth": 0.22,
            "pm10_surface": 26.0,
            "no2_tropospheric_column": 1.2e-5,
        }
        mock_worldpop_cls.return_value.fetch_data.return_value = {"population_density": 1150.0}
        mock_srtm_cls.return_value.fetch_data.return_value = {"elevation": 85.0}

        app.dependency_overrides[get_feature_pipeline] = lambda: FeaturePipeline()
        try:
            r = client.get("/api/v1/predict", params={"lat": 5.6037, "lon": -0.187, "name": "Accra"})
            assert r.status_code == 200, r.text
            data = r.json()
            assert data["pm25"] > 0
            assert data["weather"]["temp"] == pytest.approx(27.2)
            assert data["factors"]["population_density"] == pytest.approx(1150.0)
            assert data["model"]["region_id"]
        finally:
            app.dependency_overrides.clear()
