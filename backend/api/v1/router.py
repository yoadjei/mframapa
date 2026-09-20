import hashlib
import json
import re
import threading
from datetime import date as dt_date, timedelta
from functools import lru_cache
from typing import Any, Dict, List, Optional

import numpy as np
from fastapi import APIRouter, Depends, Query, HTTPException, Response, Request
from pydantic import BaseModel, Field

from backend.api.aqi import aqi_category_from_pm25
from backend.api.cities import MAJOR_CITIES, PLAYBACK_CITIES
from backend.api.demo_overrides import (
    insight_for_site,
    match_demo_site,
    prediction_payload as demo_prediction_payload,
)
from backend.api import mock_aq
from backend.api.facts import fact_for
from backend.api.insights import DRY, season_for, variants
from backend.api import supabase_admin
from backend.api import profile_store
from backend.api import saved_locations_store
from backend.feedback.store import FeedbackStore
from backend.api.security import (
    _client_ip,
    authenticate_or_anonymous,
    current_user_claims,
    current_user_id,
    require_institutional,
)
from backend.cache.redis_cache import RedisCache
from backend.config.pollutants import POLLUTANT_INFO, tightened_category
from backend.config.personalized_advice import personalized_advice
from backend.pipeline.pollutant_display import build_pollutants
from backend.services import gemini_client
from backend.ml.inference import rectify_prediction, select_bundle
from backend.pipeline.feature_pipeline import FeaturePipeline
from ml.ensemble import ensemble_mean
from ml.features import FEATURE_COLUMNS
from ml.derived_features import for_point as _derived_for_point
from ml.static_features import for_point as _static_for_point
from ml.model_selection import regional_export_dir
from ml.paths import repository_root
from ml.regions import assign_region
from ml.urban_rural import classify_from_population_density
import logging

logger = logging.getLogger(__name__)

REPO_ROOT = repository_root()
CITIES_PATH = REPO_ROOT / "backend" / "data" / "african_cities.json"


def _weather_from_features(feats: Dict[str, Any]) -> Dict[str, Any]:
    """Build API weather block; missing inputs stay null (never fake zeros)."""
    temp = feats.get("temperature_2m")
    rh = feats.get("relative_humidity")
    u = feats.get("u_component_of_wind_10m")
    v = feats.get("v_component_of_wind_10m")
    pressure = feats.get("surface_pressure")
    precip = feats.get("precipitation")
    dew = feats.get("dew_point_2m")
    cloud = feats.get("cloud_cover")

    wind = None
    if u is not None and v is not None:
        wind = round((float(u) ** 2 + float(v) ** 2) ** 0.5, 2)

    return {
        "temp": float(temp) if temp is not None else None,
        "humidity": float(rh) if rh is not None else None,
        "wind": wind,
        "pressure": round(float(pressure), 1) if pressure is not None else None,
        "precipitation": round(float(precip), 2) if precip is not None else None,
        "dew_point": round(float(dew), 1) if dew is not None else None,
        "cloud_cover": round(float(cloud), 0) if cloud is not None else None,
    }


def _factors_from_features(feats: Dict[str, Any]) -> Dict[str, Any]:
    keys = (
        "aerosol_optical_depth",
        "no2_tropospheric_column",
        "pm10_surface",
        "dust_surface",
        "population_density",
        "elevation",
    )
    return {k: feats.get(k) for k in keys if feats.get(k) is not None}


@lru_cache(maxsize=12)
def _load_bundle(region_id: str, segment: str):
    """Load and cache XGBoost + LightGBM models for a region/segment pair."""
    export_dir = regional_export_dir(region_id, segment)
    xgb_path = export_dir / "xgboost.json"
    lgb_path = export_dir / "lightgbm.txt"

    xgb_model = lgb_model = None
    try:
        import xgboost as xgb
        m = xgb.Booster()
        m.load_model(str(xgb_path))
        xgb_model = m
    except Exception as e:
        logger.warning("Failed to load XGBoost model for %s/%s: %s", region_id, segment, e)
    try:
        import lightgbm as lgb
        lgb_model = lgb.Booster(model_file=str(lgb_path))
    except Exception as e:
        logger.warning("Failed to load LightGBM model for %s/%s: %s", region_id, segment, e)

    return xgb_model, lgb_model


def _run_ml_inference(feats: Dict[str, Any], region_id: str, segment: str) -> Optional[float]:
    """Build feature vector and run ensemble inference. Returns pm25 or None."""
    xgb_model, lgb_model = _load_bundle(region_id, segment)
    if xgb_model is None and lgb_model is None:
        return None

    X = np.array(
        [[float(feats.get(col) or 0.0) for col in FEATURE_COLUMNS]],
        dtype=np.float32,
    )

    preds = []
    if xgb_model is not None:
        try:
            import xgboost as xgb
            dm = xgb.DMatrix(X, feature_names=list(FEATURE_COLUMNS))
            preds.append(xgb_model.predict(dm))
        except Exception as e:
            logger.warning("XGBoost inference failed: %s", e)
    if lgb_model is not None:
        try:
            preds.append(lgb_model.predict(X))
        except Exception as e:
            logger.warning("LightGBM inference failed: %s", e)

    if not preds:
        return None
    if len(preds) == 1:
        return float(np.clip(preds[0][0], 0.0, 500.0))
    return float(np.clip(ensemble_mean(preds[0], preds[1])[0], 0.0, 500.0))


def _default_conformal_half_width(pm25: float) -> float:
    v = max(float(pm25), 1.0)
    return max(5.0, v * 0.22)

def _load_manifest(region_id: str, segment: str) -> Dict[str, Any]:
    manifest = regional_export_dir(region_id, segment) / "manifest.json"
    if not manifest.is_file():
        return {}
    try:
        return json.loads(manifest.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}


def _load_manifest_half_width(region_id: str, segment: str) -> Optional[float]:
    """conformal half-width from the region/segment manifest, or None."""
    width = (_load_manifest(region_id, segment).get("uncertainty") or {}).get("conformal_half_width")
    try:
        return float(width) if width is not None else None
    except (TypeError, ValueError):
        return None


def _run_inference(request, feats, region_id, segment, om_pm25):
    """predict via the region/segment bundle; fall back to openmeteo, then a constant.

    returns (pm25, half_width, degraded, source, method).
    """
    bundles = getattr(request.app.state, "models", {}) or {}
    bundle = select_bundle(bundles, region_id, segment)
    if bundle is not None:
        pm25, degraded = rectify_prediction(bundle.predict_point(feats), om_pm25)
        half = bundle.conformal_half_width or _default_conformal_half_width(pm25)
        return pm25, half, degraded, "model_ensemble", "split_conformal_manifest"

    manifest_hw = _load_manifest_half_width(region_id, segment)
    if om_pm25 is not None:
        half = manifest_hw or _default_conformal_half_width(om_pm25)
        method = "split_conformal_manifest" if manifest_hw is not None else "heuristic_relative"
        # OpenMeteo is a real secondary source — still mark degraded so clients
        # show "backup estimate" instead of looking like a full model reading.
        return om_pm25, half, True, "openmeteo_fallback", method

    logger.warning("predict: no model or OpenMeteo pm25 for %s/%s; constant fallback", region_id, segment)
    # Never present a hard-coded PM2.5 as a normal reading.
    return 25.0, _default_conformal_half_width(25.0), True, "fallback_constant", "heuristic_relative"

def _cities() -> list:
    with CITIES_PATH.open(encoding="utf-8") as f:
        return json.load(f)["cities"]

_INSIGHT_TTL = 30 * 24 * 3600   # guidance per category/language is effectively static
_I18N_TTL = 60 * 24 * 3600      # a translated bundle only changes when we ship new copy
_MAP_SUMMARY_TTL = 3 * 3600     # continental map refreshes a few times a day
# CAMS air-quality forecast runs out around day 4; past that a 'forecast' would be
# season and place only, so the horizon is capped instead of padded.
_FORECAST_DAYS = 4
_MAX_FORECAST_DAYS = 5
_FORECAST_TTL = 3 * 3600
# the archives behind the model are dependable for roughly the last month; beyond
# that a 'playback' would have no inputs behind it, so the window stops there.
_HISTORY_DAYS = 14
_MAX_HISTORY_DAYS = 30
_HISTORY_TTL = 6 * 3600         # past days only shift as archives settle


def get_feature_pipeline() -> FeaturePipeline:
    return FeaturePipeline()

# core read endpoints are public (anonymous, per-ip limited); premium routes below
# add current_tier to reject anonymous callers.
router = APIRouter(dependencies=[Depends(authenticate_or_anonymous)])

from backend.api.v1.translations import translations_router
router.include_router(translations_router)

@router.get("/health")
def health(request: Request) -> Dict[str, Any]:
    models = getattr(request.app.state, "models", {}) or {}
    try:
        from backend.cache.redis_cache import RedisCache
        redis_ok = RedisCache().is_available
    except Exception:
        redis_ok = False
    # auth reports whether tokens can actually be verified. a missing jwt library
    # does not crash anything, it just silently demotes every signed-in user to
    # anonymous, so it has to be visible from outside the box.
    from backend.api.auth import _jwt
    return {
        "status": "ok",
        "version": "v1",
        "models_loaded": len(models),
        "redis": bool(redis_ok),
        "auth": _jwt is not None,
    }


def _build_prediction(
    lat: float,
    lon: float,
    name: str,
    day: str,
    pipeline: FeaturePipeline,
) -> Dict[str, Any]:
    feats = pipeline.get_features(lat, lon, day)
    pop = feats.get("population_density")
    assigned_region = assign_region(lat, lon)
    region_id = assigned_region or "continental"
    segment = classify_from_population_density(pop if isinstance(pop, (int, float)) else None)
    # Continental fallback uses a single "all" bundle (no urban/rural split)
    infer_segment = segment if assigned_region else "all"

    # Run XGBoost + LightGBM ensemble inference
    pm25_ml = _run_ml_inference(feats, region_id, infer_segment)
    if pm25_ml is not None:
        pm25 = pm25_ml
        source = "xgb_lgb_ensemble"
    else:
        # Fallback: use OpenMeteo PM2.5 surface value
        pm25_raw = feats.get("pm25_surface")
        pm25 = float(pm25_raw) if pm25_raw is not None else 25.0
        source = "feature_pipeline_pm25_surface"
        if pm25_raw is None:
            logger.warning("ML inference unavailable and pm25_surface missing for (%s,%s); using fallback", lat, lon)

    cat = aqi_category_from_pm25(pm25)
    manifest = _load_manifest(region_id, segment)
    manifest_hw = (manifest.get("uncertainty") or {}).get("conformal_half_width")
    half = float(manifest_hw) if manifest_hw is not None else _default_conformal_half_width(pm25)
    lower = max(0.0, pm25 - half)
    upper = pm25 + half

    uncertainty_method = "split_conformal_manifest" if manifest_hw is not None else "heuristic_relative"

    pm25_rounded = round(pm25, 2)
    return {
        "pm25": pm25_rounded,
        "aqi_category": cat,
        "pollutants": build_pollutants(feats, pm25_rounded, pm25_ml is None, source, lat, lon),
        "factors": _factors_from_features(feats),
        "weather": _weather_from_features(feats),
        "uncertainty": {
            "pm25_lower": round(lower, 2),
            "pm25_upper": round(upper, 2),
            "half_width": round(half, 2),
            "coverage": 0.9,
            "method": uncertainty_method,
        },
        "location": {"name": name, "lat": lat, "lon": lon},
        "model": {
            "region_id": region_id,
            "segment": segment,
            "version": "2.0.0",
            "source": source,
        },
    }

@router.get("/resolve-location")
def resolve_location(
    city: str = Query(..., min_length=1, description="City name (partial match, Africa dataset)"),
) -> Dict[str, Any]:
    q = city.strip().lower()
    if not q:
        raise HTTPException(400, "city is required")
    best: Optional[Dict[str, Any]] = None
    for c in _cities():
        name = str(c.get("name", "")).lower()
        country = str(c.get("country", "")).lower()
        if q in name or q in f"{name}, {country}".lower() or name.startswith(q):
            best = c
            break
    if best is None:
        for c in _cities():
            if q in str(c.get("country", "")).lower():
                best = c
                break
    if best is None:
        raise HTTPException(404, "City not found in African coverage dataset")
    return {
        "lat": float(best["lat"]),
        "lon": float(best["lon"]),
        "name": f"{best['name']}, {best['country']}",
        "is_africa": True,
    }

def compute_prediction(
    request: Request,
    lat: float,
    lon: float,
    name: str,
    day: Optional[str],
    pipeline: FeaturePipeline,
    include_comparison: bool = False,
    user_id: Optional[str] = None,
) -> Dict[str, Any]:
    """assemble features, run inference, and build the §2 response dict."""
    d = day or dt_date.today().isoformat()

    # snap to the ~1km grid our inputs actually resolve. latitude and longitude
    # are model features, and a phone's gps wanders by tens of metres between
    # readings, so raw coordinates made the number change on every refresh of
    # the same spot. anything finer than this is false precision anyway.
    lat, lon = round(lat, 2), round(lon, 2)

    demo = match_demo_site(lat, lon, name)
    if demo is not None:
        return demo_prediction_payload(demo, name, lat, lon)

    # Continent-wide spatial mock (pitch / demo). Exact demo sites above win first.
    mock = mock_aq.prediction_payload(lat, lon, name, d)
    if mock is not None:
        mock.pop("_mock_kind", None)
        return mock

    result = None
    # assemble features and run inference pipeline
    feats = pipeline.get_features(lat, lon, d)
    feats["lat"], feats["lon"] = lat, lon  # spatial features for models that use them
    feats.update(_derived_for_point(lat, lon, d))  # season + dust-proximity features
    feats.update(_static_for_point(lat, lon))       # ndvi + night-lights (nan until grid built)
    om_pm25 = feats.get("pm25_surface")
    om_pm25 = float(om_pm25) if om_pm25 is not None else None

    pop = feats.get("population_density")
    # local import to avoid cross-module cycle at top-level
    from ml.urban_rural import classify_from_population_density
    region_id = assign_region(lat, lon) or "west_africa"
    segment = classify_from_population_density(pop if isinstance(pop, (int, float)) else None)

    pm25, half, degraded, source, method = _run_inference(request, feats, region_id, segment, om_pm25)
    pm25 = round(pm25, 2)

    comparison = None
    if include_comparison:
        try:
            comparison = _weekly_comparison(request, lat, lon, pm25, d, pipeline)
        except Exception as e:
            logger.warning("compute_prediction: weekly comparison failed — %s", e)

    cat = aqi_category_from_pm25(pm25)
    pollutants = build_pollutants(feats, pm25, degraded, source, lat, lon)

    personalized = None
    health_conditions: Optional[list] = None
    if user_id:
        try:
            profile = profile_store.get_profile(user_id)
            if profile:
                health_conditions = profile.get("health_conditions")
                personalized = tightened_category(cat, health_conditions)
        except Exception as e:
            logger.warning("compute_prediction: personalization lookup failed — %s", e)

    # Guests and signed-in users with no sensitizing condition both fall
    # through to GENERAL_RULES inside personalized_advice() — "general
    # public" advice, never an empty list, per the product brief.
    pollutant_pcts = {p["code"]: p["pct_of_limit"] for p in pollutants}
    advice = personalized_advice(health_conditions, pollutant_pcts)

    return {
        "pm25": pm25,
        "aqi_category": cat,
        "degraded": degraded,
        "pollutants": pollutants,
        "comparison": comparison,
        "personalized": personalized,
        "personalized_advice": advice,
        "factors": _factors_from_features(feats),
        "weather": _weather_from_features(feats),
        "uncertainty": {
            "pm25_lower": round(max(0.0, pm25 - half), 2),
            "pm25_upper": round(pm25 + half, 2),
            "half_width": round(half, 2),
            "coverage": 0.9,
            "method": method,
        },
        "location": {"name": name, "lat": lat, "lon": lon},
        "model": {"region_id": region_id, "segment": segment, "version": "2.0.0", "source": source},
    }

_COMPARISON_DAYS = 7
_COMPARISON_TTL = 6 * 3600  # matches _HISTORY_TTL — same archive-stability reasoning
_comparison_inflight: set = set()
_comparison_inflight_lock = threading.Lock()


def _fill_weekly_comparison_cache(
    request: Request, lat: float, lon: float, day: str, pipeline: FeaturePipeline, cache_key: str
) -> None:
    """Background fill for the 7-day average (see _weekly_comparison). Runs off
    the request thread — each of the 7 reconstructions can itself be slow
    against live satellite/reanalysis APIs, and nothing here should add that
    latency to a user's /predict call."""
    cache = RedisCache()
    try:
        base = dt_date.fromisoformat(day)
        values: List[float] = []
        for offset in range(1, _COMPARISON_DAYS + 1):
            target = (base - timedelta(days=offset)).isoformat()
            try:
                prior = compute_prediction(request, lat, lon, "Unknown", target, pipeline)
                values.append(prior["pm25"])
            except Exception as e:
                logger.warning("weekly comparison background fill: day=%s failed — %s", target, e)
        if values:
            avg = round(sum(values) / len(values), 2)
            cache.set(cache_key, {"avg": avg}, _COMPARISON_TTL)
    finally:
        with _comparison_inflight_lock:
            _comparison_inflight.discard(cache_key)


def _weekly_comparison(
    request: Request, lat: float, lon: float, pm25: float, day: str, pipeline: FeaturePipeline
) -> Optional[Dict[str, Any]]:
    """This location's pm2.5 vs. its own average over the 7 days before `day`.

    Cached per grid cell (6h) and shared across everyone asking about that
    cell. On a cold cache, the 7 reconstructions are filled in a background
    thread rather than inline — reconstructing 7 days synchronously on every
    /predict call would multiply the endpoint's latency by up to 8x against
    the live data sources, which the brief's "patchy connections" requirement
    rules out. The caller (this request) gets no comparison the first time;
    the next request against this cell within the TTL gets a cache hit.
    Never called from history()/forecast()/map_summary(), which already loop
    compute_prediction themselves — this stays opt-in (include_comparison=True).
    """
    cache = RedisCache()
    cache_key = f"avg7:{lat:.2f}:{lon:.2f}:{day}"
    hit = cache.get(cache_key)
    week_avg = hit.get("avg") if hit else None

    if week_avg is None:
        with _comparison_inflight_lock:
            already_filling = cache_key in _comparison_inflight
            if not already_filling:
                _comparison_inflight.add(cache_key)
        if not already_filling:
            threading.Thread(
                target=_fill_weekly_comparison_cache,
                args=(request, lat, lon, day, pipeline, cache_key),
                daemon=True,
            ).start()
        return None

    if not week_avg:
        return None
    pct_vs_week_avg = round(((pm25 - week_avg) / week_avg) * 100.0, 1)
    return {"week_avg_pm25": week_avg, "pct_vs_week_avg": pct_vs_week_avg}


@router.get("/predict")
def predict(
    request: Request,
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    name: str = Query("Unknown"),
    day: Optional[str] = Query(None, description="ISO date YYYY-MM-DD (default: today)"),
    pipeline: FeaturePipeline = Depends(get_feature_pipeline),
    user_id: Optional[str] = Depends(current_user_id),
) -> Dict[str, Any]:
    return compute_prediction(
        request, lat, lon, name, day, pipeline, include_comparison=True, user_id=user_id
    )


@router.get("/forecast")
def forecast(
    request: Request,
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    name: str = Query("Unknown"),
    days: int = Query(_FORECAST_DAYS, ge=1, le=_MAX_FORECAST_DAYS),
    pipeline: FeaturePipeline = Depends(get_feature_pipeline),
) -> Dict[str, Any]:
    """multi-day pm2.5 outlook, limited to the horizon our inputs actually cover.

    the model needs forecast weather and CAMS air quality. weather runs further out
    than CAMS, so beyond roughly four days a "forecast" would quietly become a
    season-and-place guess. each day therefore reports the inputs it actually had,
    and the horizon is capped rather than padded with numbers we cannot back.
    """
    today = dt_date.today()
    cache = RedisCache()
    cache_key = f"forecast:{round(lat, 2)}:{round(lon, 2)}:{today.isoformat()}:{days}"
    hit = cache.get(cache_key)
    if hit and hit.get("days"):
        return hit

    out: List[Dict[str, Any]] = []
    for offset in range(days):
        target = (today + timedelta(days=offset)).isoformat()
        try:
            prediction = compute_prediction(request, lat, lon, name, target, pipeline)
        except Exception as e:
            logger.warning("forecast: %s day=%s failed — %s", name, target, e)
            continue
        factors = prediction.get("factors") or {}
        weather = prediction.get("weather") or {}
        # full == the dynamic inputs the model was trained on were available
        has_weather = weather.get("temp") is not None
        has_air = "aerosol_optical_depth" in factors or "no2_tropospheric_column" in factors
        out.append({
            "date": target,
            "day_offset": offset,
            "pm25": prediction["pm25"],
            "aqi_category": prediction["aqi_category"],
            "uncertainty": prediction.get("uncertainty"),
            "inputs": "full" if (has_weather and has_air) else "reduced",
        })

    payload = {
        "location": {"name": name, "lat": lat, "lon": lon},
        "issued": today.isoformat(),
        "days": out,
    }
    if out:
        cache.set(cache_key, payload, _FORECAST_TTL)
    return payload


@router.get("/history")
def history(
    request: Request,
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    name: str = Query("Unknown"),
    days: int = Query(_HISTORY_DAYS, ge=1, le=_MAX_HISTORY_DAYS),
    pipeline: FeaturePipeline = Depends(get_feature_pipeline),
) -> Dict[str, Any]:
    """pm2.5 for the recent past, reconstructed by running the model on each day.

    the satellite and reanalysis archives we depend on are reliable for the last
    few weeks, so the window is capped there. going back further would mean
    serving numbers with no inputs behind them. days we cannot reconstruct are
    left out rather than interpolated, and the series runs oldest to newest so a
    playback can scrub straight through it.
    """
    today = dt_date.today()
    cache = RedisCache()
    cache_key = f"history:{round(lat, 2)}:{round(lon, 2)}:{today.isoformat()}:{days}"
    hit = cache.get(cache_key)
    if hit and hit.get("days"):
        return hit

    out: List[Dict[str, Any]] = []
    for offset in range(days - 1, -1, -1):          # oldest first, today last
        target = (today - timedelta(days=offset)).isoformat()
        try:
            prediction = compute_prediction(request, lat, lon, name, target, pipeline)
        except Exception as e:
            logger.warning("history: %s day=%s failed — %s", name, target, e)
            continue
        out.append({
            "date": target,
            "days_ago": offset,
            "pm25": prediction["pm25"],
            "aqi_category": prediction["aqi_category"],
            "uncertainty": prediction.get("uncertainty"),
        })

    payload = {
        "location": {"name": name, "lat": lat, "lon": lon},
        "start": (today - timedelta(days=days - 1)).isoformat(),
        "end": today.isoformat(),
        "days": out,
    }
    if out:                                          # never cache a total outage
        cache.set(cache_key, payload, _HISTORY_TTL)
    return payload


@router.get("/map-history")
def map_history(
    request: Request,
    days: int = Query(_HISTORY_DAYS, ge=1, le=_MAX_HISTORY_DAYS),
    pipeline: FeaturePipeline = Depends(get_feature_pipeline),
) -> Dict[str, Any]:
    """the whole playback window for the playback cities, in one cached payload.

    the client would otherwise request each city separately, and every client
    would pay to rebuild the same fixed window. the city set is fixed, so the
    work is done once and the result is shared by everyone.
    """
    today = dt_date.today()
    cache = RedisCache()
    cache_key = f"map:history:{today.isoformat()}:{days}"
    hit = cache.get(cache_key)
    if hit and hit.get("cities"):
        return hit

    dates = [(today - timedelta(days=offset)).isoformat() for offset in range(days - 1, -1, -1)]
    cities: List[Dict[str, Any]] = []
    for name, lat, lon in PLAYBACK_CITIES:
        rows: List[Dict[str, Any]] = []
        for target in dates:
            try:
                prediction = compute_prediction(request, lat, lon, name, target, pipeline)
            except Exception as e:
                logger.warning("map-history: %s day=%s failed — %s", name, target, e)
                continue
            rows.append({
                "date": target,
                "pm25": prediction["pm25"],
                "aqi_category": prediction["aqi_category"],
            })
        if rows:                    # a city we could not rebuild is left out entirely
            cities.append({"name": name, "lat": lat, "lon": lon, "days": rows})

    payload = {"start": dates[0], "end": dates[-1], "dates": dates, "cities": cities}
    if cities:
        cache.set(cache_key, payload, _HISTORY_TTL)
    return payload


def build_map_summary(request, pipeline: FeaturePipeline) -> Dict[str, Any]:
    """build (or reuse) today's continental summary.

    shared with the startup pre-warm: building ~200 cities takes far longer than
    nginx will wait, so the first user must never be the one who pays for it.
    Search uses the full city dataset; the map stays on this warm major set.
    """
    day = dt_date.today().isoformat()
    cache = RedisCache()
    mock_on = mock_aq.mock_aq_enabled()
    cache_key = f"map:summary:mock:{day}" if mock_on else f"map:summary:{day}"
    hit = cache.get(cache_key)
    if hit and hit.get("cities"):
        return hit

    cities: List[Dict[str, Any]] = []
    for name, lat, lon in MAJOR_CITIES:
        try:
            prediction = compute_prediction(request, lat, lon, name, day, pipeline)
        except Exception as e:                    # one bad city must not blank the map
            logger.warning("map-summary: %s failed — %s", name, e)
            continue
        cities.append({
            "name": name, "lat": lat, "lon": lon,
            "pm25": prediction["pm25"],
            "aqi_category": prediction["aqi_category"],
        })

    payload = {"day": day, "count": len(cities), "cities": cities}
    if cities:
        cache.set(cache_key, payload, _MAP_SUMMARY_TTL)
    return payload


class HealthProfileBody(BaseModel):
    home_location: Optional[Dict[str, Any]] = None
    work_location: Optional[Dict[str, Any]] = None
    health_conditions: List[str] = Field(default_factory=list)
    routine: Optional[Dict[str, Any]] = None


@router.get("/health-profile")
def get_health_profile(user_id: Optional[str] = Depends(current_user_id)) -> Dict[str, Any]:
    """The signed-in user's onboarding health profile, or an empty shell for a
    signed-in user who hasn't set one yet. 401 for anonymous callers — this is
    sensitive personal data, never guessable from a device fingerprint."""
    if not user_id:
        raise HTTPException(status_code=401, detail="Sign in to view your health profile")
    profile = profile_store.get_profile(user_id) or {}
    return {
        "home_location": profile.get("home_location"),
        "work_location": profile.get("work_location"),
        "health_conditions": profile.get("health_conditions") or [],
        "routine": profile.get("routine"),
    }


@router.put("/health-profile")
def put_health_profile(
    body: HealthProfileBody, user_id: Optional[str] = Depends(current_user_id)
) -> Dict[str, Any]:
    if not user_id:
        raise HTTPException(status_code=401, detail="Sign in to save your health profile")
    saved = profile_store.upsert_profile(user_id, body.model_dump())
    if saved is None:
        raise HTTPException(status_code=502, detail="Could not save your health profile")
    return {"status": "saved"}


@router.delete("/health-profile")
def delete_health_profile(user_id: Optional[str] = Depends(current_user_id)) -> Dict[str, str]:
    if not user_id:
        raise HTTPException(status_code=401, detail="Sign in to delete your health profile")
    profile_store.delete_profile(user_id)
    return {"status": "deleted"}


class SavedLocationBody(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    lat: float = Field(..., ge=-90, le=90)
    lon: float = Field(..., ge=-180, le=180)
    country: Optional[str] = None


@router.get("/saved-locations")
def list_saved_locations(user_id: Optional[str] = Depends(current_user_id)) -> Dict[str, Any]:
    """Account-level sync on top of the PWA's already-working local saved-
    locations feature (savedCities in appState.jsx) — guests keep using that
    unchanged; this only follows a signed-in user to a new device."""
    if not user_id:
        raise HTTPException(status_code=401, detail="Sign in to sync saved locations")
    return {"locations": saved_locations_store.list_locations(user_id)}


@router.post("/saved-locations")
def add_saved_location(
    body: SavedLocationBody, user_id: Optional[str] = Depends(current_user_id)
) -> Dict[str, str]:
    if not user_id:
        raise HTTPException(status_code=401, detail="Sign in to save locations")
    ok = saved_locations_store.save_location(user_id, body.name, body.lat, body.lon, body.country)
    if not ok:
        raise HTTPException(status_code=502, detail="Could not save this location")
    return {"status": "saved"}


@router.delete("/saved-locations/{name}")
def remove_saved_location(name: str, user_id: Optional[str] = Depends(current_user_id)) -> Dict[str, str]:
    if not user_id:
        raise HTTPException(status_code=401, detail="Sign in to manage saved locations")
    saved_locations_store.delete_location(user_id, name)
    return {"status": "deleted"}


@router.delete("/account")
def delete_account(user_id: Optional[str] = Depends(current_user_id)) -> Dict[str, str]:
    """permanently delete the caller's account.

    apple and google both require an in-app deletion path, and both clients
    previously faked it. this removes the supabase user, which is where the
    email, the chosen home city and the tier live. push tokens are keyed by
    device and location rather than by user, so they expire on their own.
    the health_profiles row (docs/db/health_profiles.sql) is FK'd to this user
    with ON DELETE CASCADE, so it's removed by postgres, not this handler.
    """
    if not user_id:
        raise HTTPException(status_code=401, detail="Sign in to delete your account")

    try:
        ok = supabase_admin.delete_user(user_id)
    except Exception as exc:
        logger.exception("account deletion failed")
        raise HTTPException(status_code=502, detail="Could not delete the account") from exc

    if not ok:
        raise HTTPException(status_code=502, detail="Could not delete the account")
    return {"status": "deleted"}


@router.post("/auth/welcome")
def send_welcome(
    claims: Optional[Dict[str, Any]] = Depends(current_user_claims),
) -> Dict[str, Any]:
    """Send the one-time Welcome email after a real signed-in session.

    Call from the app on LOGIN_SUCCESS / first restored session. Deduped per
    Supabase user id so repeat logins do not spam. Requires RESEND_API_KEY.
    """
    if not claims or not claims.get("user_id"):
        raise HTTPException(status_code=401, detail="Sign in to continue")

    email = claims.get("email")
    if not email:
        raise HTTPException(status_code=422, detail="No email on this account")

    try:
        from backend.email.welcome import send_welcome_email

        status, emailed = send_welcome_email(user_id=claims["user_id"], email=email)
    except Exception as exc:
        logger.exception("welcome email failed")
        raise HTTPException(status_code=502, detail="Could not send welcome email") from exc

    return {"status": status, "emailed": emailed}


class FeedbackBody(BaseModel):
    category: str = "general"
    message: str = Field(..., min_length=1, max_length=20000)
    email: Optional[str] = None
    platform: Optional[str] = None


@lru_cache(maxsize=1)
def _feedback_store() -> FeedbackStore:
    return FeedbackStore()


def get_feedback_store() -> FeedbackStore:
    return _feedback_store()


@router.post("/feedback")
def submit_feedback(
    body: FeedbackBody,
    store: FeedbackStore = Depends(get_feedback_store),
) -> Dict[str, str]:
    """store a user report.

    public on purpose: the people most likely to hit a bug have no account, and
    making them sign in to tell us about it would lose the report. the form used
    to pretend to submit and then drop the message.
    """
    if not body.message.strip():
        raise HTTPException(status_code=422, detail="A message is required")
    try:
        feedback_id = store.add(
            category=body.category,
            message=body.message,
            email=body.email,
            platform=body.platform,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("could not store feedback")
        raise HTTPException(status_code=502, detail="Could not send your feedback") from exc

    # Best-effort inbox notify — storage already succeeded.
    try:
        from backend.feedback.notify import notify_feedback_email

        notify_feedback_email(
            feedback_id=feedback_id,
            category=body.category,
            message=body.message,
            email=body.email,
            platform=body.platform,
        )
    except Exception:
        logger.exception("feedback email notify failed (report still stored)")

    return {"status": "received"}


@router.get("/daily-fact")
def daily_fact(
    language: str = Query("en", min_length=2, max_length=8),
    language_name: str = Query(""),
) -> Dict[str, str]:
    """one short, reviewed fact a day, the same for everyone.

    goes out as the daily notification as well as appearing in the app, so it
    is translated once per language and then served from cache.
    """
    text = fact_for()
    lang = (language or "en").lower()
    if lang in ("en", ""):
        return {"fact": text}

    cache = RedisCache()
    key = f"fact:{dt_date.today().isoformat()}:{lang}"
    hit = (cache.get(key) or {}).get("fact")
    if hit:
        return {"fact": hit}

    if gemini_client.is_available():
        try:
            out = gemini_client.translate_strings(
                {"fact": text},
                target_language=lang,
                target_language_name=language_name or None,
            )
            translated = out.get("fact", text)
            cache.set(key, {"fact": translated}, _INSIGHT_TTL)
            return {"fact": translated}
        except Exception as exc:
            logger.warning("fact translation failed, serving english: %s", exc)

    return {"fact": text}


@router.get("/pollutant-info")
def pollutant_info() -> Dict[str, Any]:
    """Static per-pollutant health copy (what it is, sources, effects, actions).

    Served separately from /predict so the numeric payload the client refreshes
    constantly stays light — this only changes when we ship new copy, so the
    client fetches it once and caches it (see frontend-pwa's CacheFirst rule).
    """
    return {"pollutants": POLLUTANT_INFO}


@router.get("/map-summary")
def map_summary(
    request: Request,
    pipeline: FeaturePipeline = Depends(get_feature_pipeline),
) -> Dict[str, Any]:
    """today's pm2.5 for the major cities, for the continental map.

    one cached request instead of one per city: the client would otherwise burn
    its whole anonymous rate-limit budget drawing a single screen.
    """
    return build_map_summary(request, pipeline)


class BatchLocation(BaseModel):
    lat: float = Field(..., ge=-90, le=90)
    lon: float = Field(..., ge=-180, le=180)
    name: str = Field(default="Unknown")


class BatchPredictRequest(BaseModel):
    locations: List[BatchLocation] = Field(..., min_length=1, max_length=20)
    day: Optional[str] = Field(default=None)


# bulk prediction is an institutional feature (scope §5); individuals use /predict.
@router.post("/batch-predict", dependencies=[Depends(require_institutional)])
def batch_predict(
    body: BatchPredictRequest,
    pipeline: FeaturePipeline = Depends(get_feature_pipeline),
) -> Dict[str, Any]:
    day = body.day or dt_date.today().isoformat()
    results: List[Dict[str, Any]] = []
    errors: List[Dict[str, Any]] = []

    for idx, item in enumerate(body.locations):
        try:
            results.append(
                _build_prediction(
                    lat=item.lat,
                    lon=item.lon,
                    name=item.name,
                    day=day,
                    pipeline=pipeline,
                )
            )
        except Exception as exc:
            logger.exception("Batch prediction failed at index %s", idx)
            errors.append({"index": idx, "name": item.name, "detail": str(exc)})

    return {
        "day": day,
        "count": len(body.locations),
        "success_count": len(results),
        "error_count": len(errors),
        "results": results,
        "errors": errors,
    }

class InsightBody(BaseModel):
    pm25: float = Field(..., ge=0)
    aqi_category: str = ""
    weather: Dict[str, Any] = Field(default_factory=dict)
    language: str = "en"
    language_name: str = ""
    lat: Optional[float] = Field(default=None, ge=-90, le=90)
    lon: Optional[float] = Field(default=None, ge=-180, le=180)
    # first name of the signed-in user, if any — lets a fraction of the reviewed
    # lines address them directly ("Wear a mask today, Davis."). blank for
    # anonymous callers, who never draw one of those lines (see generate_insight).
    name: str = Field(default="", max_length=40)

class TranslateBody(BaseModel):
    strings: Dict[str, str] = Field(..., min_length=1)
    target_language: str = Field(..., min_length=2, max_length=8)
    source_language: str = "en"
    target_language_name: str = ""

@router.post("/translate")
def translate_ui_strings(body: TranslateBody) -> Dict[str, Any]:
    """Translate UI string bundles via Gemini, cached in redis by bundle+language.

    the bundle changes only when we ship new copy, so each language is translated
    once and then served from redis — persistent across restarts and cheap under
    load, so a lapsed api key or a traffic spike never blocks the ui.
    """
    if body.target_language.lower() == body.source_language.lower():
        return {"translations": body.strings, "fallback": False, "provider": "none"}

    cache = RedisCache()
    digest = hashlib.sha1(
        json.dumps(body.strings, sort_keys=True, ensure_ascii=False).encode()
    ).hexdigest()[:16]
    cache_key = f"i18n:{body.target_language.lower()}:{digest}"
    hit = cache.get(cache_key)
    if hit and hit.get("translations"):
        return {"translations": hit["translations"], "fallback": False, "provider": "cache"}

    if not gemini_client.is_available():
        return {"translations": body.strings, "fallback": True, "provider": "none"}

    try:
        translations = gemini_client.translate_strings(
            body.strings,
            target_language=body.target_language,
            source_language=body.source_language,
            target_language_name=body.target_language_name or None,
        )
    except Exception as exc:
        # a quota trip or provider outage must never blank the interface: english
        # copy is readable, a 502 is not. the caller sees fallback=True and can
        # retry later, by which point the cache may be warm.
        logger.warning("Gemini translate failed: %s", exc)
        return {"translations": body.strings, "fallback": True, "provider": "none"}

    cache.set(cache_key, {"translations": translations}, _I18N_TTL)
    return {"translations": translations, "fallback": False, "provider": "gemini"}


def _insight_category_key(aqi_category: str, pm25: float) -> str:
    cat = (aqi_category or aqi_category_from_pm25(pm25)).lower()
    if "hazardous" in cat:
        return "hazardous"
    if "unhealthy" in cat and "sensitive" not in cat:
        return "unhealthy"
    if "sensitive" in cat:
        return "sensitive"
    if "moderate" in cat:
        return "moderate"
    return "good"


@router.post("/generate-insight")
def generate_insight(body: InsightBody, request: Request) -> Dict[str, str]:
    """rotate through reviewed guidance for this category and season.

    the lines are written and checked in english (backend/api/insights.py), then
    translated once per language through the same cached pipeline as the rest of
    the interface. no model writes health advice at request time: across fifty
    five languages nobody here could review what it said.
    """
    cat = body.aqi_category or aqi_category_from_pm25(body.pm25)
    key = _insight_category_key(cat, body.pm25)
    language = (body.language or "en").lower()
    season = (
        season_for(body.lat, body.lon)
        if body.lat is not None and body.lon is not None
        else DRY
    )

    # Pitch demo sites: fixed guidance that matches the forced AQI / story.
    if body.lat is not None and body.lon is not None:
        demo = match_demo_site(float(body.lat), float(body.lon), None)
        if demo is not None and language in ("en", ""):
            return {"insight": _clean_guidance(insight_for_site(demo))}
        mock_line = mock_aq.insight_for_point(float(body.lat), float(body.lon), language)
        if mock_line:
            return {"insight": _clean_guidance(mock_line)}

    cache = RedisCache()
    lines = variants(key, season)

    # non-english: translate the set once, then rotate inside it. that is one
    # translation per category, season and language, cached for two months.
    if language not in ("en", ""):
        bundle_key = f"insight:lines:{key}:{season}:{language}"
        hit = (cache.get(bundle_key) or {}).get("lines")
        if hit:
            lines = hit
        elif gemini_client.is_available():
            try:
                mapping = {str(i): line for i, line in enumerate(lines)}
                out = gemini_client.translate_strings(
                    mapping,
                    target_language=language,
                    target_language_name=body.language_name or None,
                )
                translated = [out.get(str(i), line) for i, line in enumerate(lines)]
                cache.set(bundle_key, {"lines": translated}, _I18N_TTL)
                lines = translated
            except Exception as exc:
                logger.warning("insight translation failed, serving english: %s", exc)

    # a portion of lines address the user by name ("{{name}}"). anonymous
    # callers must never see a raw placeholder, so those lines simply drop out
    # of the pool unless a name was supplied.
    name = _sanitize_name(body.name)
    pool = lines if name else [l for l in lines if "{{name}}" not in l]
    if not pool:
        pool = lines

    # a shared counter meant the line changed on every tap, so the advice read
    # as though it kept changing its mind. the choice is instead fixed by who is
    # asking and what day it is: steady while you use the app, different for the
    # next person, and new tomorrow.
    who = _client_ip(request)
    seed = f"{who}:{key}:{season}:{dt_date.today().isoformat()}"
    index = int(hashlib.sha1(seed.encode()).hexdigest()[:8], 16)
    chosen = pool[index % len(pool)]
    if name:
        chosen = chosen.replace("{{name}}", name)
    return {"insight": _clean_guidance(chosen)}


def _sanitize_name(raw: str) -> str:
    """First name only, trimmed to a plausible name shape.

    this is inserted verbatim into health-advice text shown in the ui, so it is
    reduced to a single alphabetic-ish token rather than trusted as free text.
    """
    first = (raw or "").strip().split()[0] if (raw or "").strip() else ""
    return re.sub(r"[^\w'\-]", "", first)[:24]


def _clean_guidance(text: str) -> str:
    """Strip separator punctuation from health lines shown in What to do."""
    out = text.replace("\u2014", " ").replace("\u2013", " ").replace("—", " ").replace("–", " ")
    out = re.sub(r"\s*[-–—]\s*", " ", out)
    out = re.sub(r"[;:]", ".", out)
    out = re.sub(r"\.{2,}", ".", out)
    return re.sub(r"\s+", " ", out).strip()


# Push token registration — use persistent store if available

class PushTokenBody(BaseModel):
    token: str = Field(..., min_length=1)
    platform: str = Field(..., pattern="^(android|ios|web)$")
    lat: Optional[float] = None
    lon: Optional[float] = None
    # negative = alert earlier than the default AQI threshold (a sensitized
    # profile). schema + registration only for now — episode_detector.py does
    # not yet consult this when deciding whether to send an alert.
    threshold_offset: Optional[float] = None


def get_push_store():
    from backend.alerts.storage import get_push_store as _default
    return _default()

# alerts are the product and are never paywalled for individuals (scope §5, §3.2),
# so a device can register for alerts without an account — signing in only adds
# a user_id + optional personal threshold on top of that, it never gates it.
@router.post("/register-push-token", status_code=200)
def register_push_token(
    body: PushTokenBody,
    store=Depends(get_push_store),
    user_id: Optional[str] = Depends(current_user_id),
) -> Dict[str, str]:
    """Register an Expo/Web Push token for AQI alert delivery using the configured store."""
    try:
        store.register(body.token, body.platform, body.lat, body.lon, user_id, body.threshold_offset)
    except Exception as exc:
        # telling the device it is registered when the token was not persisted is
        # worse than failing: the user believes alerts are on and never hears from
        # us again. a 503 lets the client retry on the next launch.
        logger.exception("Push store failed for platform=%s", body.platform)
        raise HTTPException(
            status_code=503, detail="Could not register for alerts, please try again"
        ) from exc
    logger.info("Push token registered: platform=%s lat=%s lon=%s", body.platform, body.lat, body.lon)
    return {"status": "registered"}


@router.get("/vapid-public-key")
def get_vapid_public_key() -> Dict[str, Any]:
    """Public VAPID key for PWA Web Push subscribe (safe to expose)."""
    from backend.alerts.webpush_delivery import vapid_public_key, web_push_configured

    key = vapid_public_key()
    if not key or not web_push_configured():
        raise HTTPException(
            status_code=503,
            detail="Web Push is not configured (set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY)",
        )
    return {"publicKey": key, "configured": True}
