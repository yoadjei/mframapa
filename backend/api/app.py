"""
FastAPI application — serves /api/* for the PWA (see frontend vite proxy :8000).

Run locally::
    uvicorn backend.api.app:app --reload --host 127.0.0.1 --port 8000
"""

from __future__ import annotations

from dotenv import load_dotenv

load_dotenv()

import json
import logging
import os
from datetime import date as dt_date
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List, Optional
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from pydantic import BaseModel, Field

try:
    import sentry_sdk
    from sentry_sdk.integrations.fastapi import FastApiIntegration
    from sentry_sdk.integrations.logging import LoggingIntegration
    _dsn = os.getenv("SENTRY_DSN")
    if _dsn:
        sentry_sdk.init(
            dsn=_dsn,
            integrations=[FastApiIntegration(), LoggingIntegration()],
            traces_sample_rate=0.2,
            # privacy-first: do not attach user ip or request bodies to events
            send_default_pii=False,
            environment=os.getenv("ENVIRONMENT", "production"),
        )
except ImportError:
    pass

from backend.api.aqi import aqi_category_from_pm25
from backend.pipeline.feature_pipeline import FeaturePipeline
from ml.model_selection import regional_export_dir
from ml.paths import repository_root
from ml.regions import assign_region
from ml.urban_rural import classify_from_population_density

# Optional: model bundle loader + batch router and tracing
from backend.api.middleware.tracing import TracingMiddleware
from backend.api.security import verify_and_rate_limit
from backend.api.v1.batch import batch_router
from backend.api.v1.payments import payments_router
from backend.api.v1.analytics import analytics_router
from backend.api.cities import MAJOR_CITIES as _PREWARM_CITIES
from backend.alerts.daily import alerts_enabled, alerts_hour, run_daily_job
from backend.alerts.scheduler import build_scheduler
from backend.api.v1.router import router as v1_router
from backend.ml.inference import load_bundles

logger = logging.getLogger(__name__)

REPO_ROOT = repository_root()
CITIES_PATH = REPO_ROOT / "backend" / "data" / "african_cities.json"
_EXPORTS_DIR = REPO_ROOT / "ml" / "exports"

# small enough to stay polite to the upstream apis, large enough that warming the
# continental list takes about a minute instead of ten.
_PREWARM_WORKERS = 6


def _default_conformal_half_width(pm25: float) -> float:
    """Fallback interval half-width when no trained manifest is present."""
    v = max(float(pm25), 1.0)
    return max(5.0, v * 0.22)


def _load_manifest_half_width(region_id: str, segment: str) -> Optional[float]:
    manifest = regional_export_dir(region_id, segment) / "manifest.json"
    if not manifest.is_file():
        return None
    try:
        data = json.loads(manifest.read_text(encoding="utf-8"))
        u = data.get("uncertainty") or {}
        w = u.get("conformal_half_width")
        return float(w) if w is not None else None
    except (json.JSONDecodeError, TypeError, ValueError):
        return None


@lru_cache(maxsize=1)
def _cities() -> List[Dict[str, Any]]:
    with CITIES_PATH.open(encoding="utf-8") as f:
        return json.load(f)["cities"]


def get_feature_pipeline() -> FeaturePipeline:
    return FeaturePipeline()


# major african cities pre-warmed into the feature cache on startup so first user
# hits are instant (name, lat, lon).


def _prewarm_cache() -> None:
    """Best-effort: populate the redis feature cache for major cities (daemon thread).

    runs a few cities at a time. sequentially this took about six seconds each,
    so the continental list would have needed ten minutes before the map could
    answer from cache; the pool is small enough not to hammer the upstreams.
    """
    today = dt_date.today().isoformat()
    pipeline = FeaturePipeline()

    def warm(city) -> None:
        name, lat, lon = city
        try:
            pipeline.get_features(lat, lon, today)
        except Exception as e:
            logger.debug("prewarm %s failed: %s", name, e)

    with ThreadPoolExecutor(max_workers=_PREWARM_WORKERS) as pool:
        list(pool.map(warm, _PREWARM_CITIES))
    logger.info("cache prewarm complete (%d cities)", len(_PREWARM_CITIES))

    # build the continental map payload here too. assembling 120 cities takes
    # longer than nginx will wait, so the first visitor of the day was getting a
    # 504 while it was computed. doing it on startup means they get a cache hit.
    try:
        from backend.api.v1.router import build_map_summary

        class _Ctx:                       # build_map_summary only needs app.state
            pass

        ctx = _Ctx()
        ctx.app = app
        summary = build_map_summary(ctx, pipeline)
        logger.info("map summary warmed (%d cities)", len(summary.get("cities", [])))
    except Exception:
        logger.exception("could not warm the map summary")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Preload model bundles into app.state for fast inference
    try:
        app.state.models = load_bundles(_EXPORTS_DIR)
    except Exception:
        logger.exception("Failed to load model bundles at startup")
        app.state.models = {}
    # warm the feature cache in the background — never blocks startup or requests.
    # disabled in ci/tests (PREWARM_ON_START=0) to avoid live upstream calls.
    if os.getenv("PREWARM_ON_START", "1") == "1":
        import threading
        threading.Thread(target=_prewarm_cache, daemon=True).start()

    # daily episode scan -> push alerts -> radio bulletin (the core product loop).
    # opt-in via ALERTS_ENABLED=1 so dev/ci never notify real devices.
    app.state.scheduler = None
    if alerts_enabled():
        try:
            base_url = os.getenv("ALERTS_BASE_URL", "http://127.0.0.1:8000").rstrip("/")
            app.state.scheduler = build_scheduler(
                lambda: run_daily_job(_PREWARM_CITIES, base_url=base_url),
                hour=alerts_hour(),
            )
            app.state.scheduler.start()
            logger.info(
                "alert scheduler started (daily at %02d:00 UTC, base=%s, cities=%d)",
                alerts_hour(),
                base_url,
                len(_PREWARM_CITIES),
            )
        except Exception:
            logger.exception("could not start alert scheduler")

    yield

    if getattr(app.state, "scheduler", None) is not None:
        app.state.scheduler.shutdown(wait=False)
    app.state.models = {}


app = FastAPI(title="Mframapa API", version="2.0.0", description="Mframapa AI v2.0 Versioned API with rate limiting and API keys.", lifespan=lifespan)

_DEFAULT_ORIGINS = ",".join(
    [
        "http://localhost:5173",
        "http://localhost:5174",
        "https://mframapa.live",
        "https://www.mframapa.live",
    ]
)
_ALLOWED_ORIGINS = [
    o.strip() for o in os.getenv("ALLOWED_ORIGINS", _DEFAULT_ORIGINS).split(",") if o.strip()
]
# Vite auto-increments past 5173/5174 the moment either port is already taken
# by another dev-server instance (common with several local sessions running
# at once), silently CORS-blocking every API call from whatever port it lands
# on instead. Scoped to loopback only — never matches a real domain, so this
# doesn't widen what's allowed in production.
_LOCALHOST_ORIGIN_REGEX = r"^https?://(localhost|127\.0\.0\.1):\d+$"
app.add_middleware(TracingMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=_ALLOWED_ORIGINS,
    allow_origin_regex=_LOCALHOST_ORIGIN_REGEX,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(GZipMiddleware, minimum_size=100)

app.include_router(v1_router, prefix="/api/v1", tags=["v1"])
# batch is mounted separately (not under v1_router) to avoid a router<->batch import cycle.
app.include_router(
    batch_router, prefix="/api/v1", tags=["v1"],
    dependencies=[Depends(verify_and_rate_limit)],
)
# payments: paystack calls this itself, so it can't send one of our api keys —
# it authenticates by signing the body with our paystack secret instead.
app.include_router(payments_router, prefix="/api/v1", tags=["payments"])
# analytics: /events is anonymous (per-route), /metrics is internal-only (per-route).
app.include_router(analytics_router, prefix="/api/v1", tags=["analytics"])

# Legacy support - keeping the old root paths but returning a hint to use v1.
@app.get("/api/health")
def old_health() -> Dict[str, str]:
    return {"status": "ok", "message": "Please upgrade to /api/v1/health"}

@app.get("/api/resolve-location")
def old_resolve_location(city: str = Query(...)) -> Dict[str, Any]:
    raise HTTPException(status_code=410, detail="Endpoint deprecated. Use /api/v1/resolve-location with an API key.")

@app.get("/api/predict")
def old_predict() -> Dict[str, Any]:
    raise HTTPException(status_code=410, detail="Endpoint deprecated. Use /api/v1/predict with an API key.")

@app.post("/api/generate-insight")
def old_generate_insight() -> Dict[str, str]:
    raise HTTPException(status_code=410, detail="Endpoint deprecated. Use /api/v1/generate-insight with an API key.")

