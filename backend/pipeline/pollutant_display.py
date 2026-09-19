"""Builds the user-facing pollutants[] array from raw feature values.

Separate from FeaturePipeline/DataOrchestrator on purpose: those resolve
ML-model inputs (and cache them as a single blended dict), while this module
turns the surface-concentration subset of that same fetch into WHO-limit
ratios, severity tiers, and a per-pollutant last-known-value fallback so a
partial CAMS outage shows a stale cached reading (with its own timestamp)
instead of silently blanking a card for up to 6 hours.
"""

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from backend.cache.redis_cache import RedisCache
from backend.config.pollutants import (
    POLLUTANT_META,
    POLLUTANT_ORDER,
    WHO_2021_GUIDELINES,
    cigarette_equivalent,
    pct_of_who_limit,
    severity_for_pct,
)

logger = logging.getLogger(__name__)

_LAST_KNOWN_TTL = 3 * 24 * 3600  # 3 days — long enough to bridge a multi-hour outage

# Feature key + source label for each pollutant, excluding pm25 (handled
# separately below because it comes from the satellite ensemble, not CAMS).
_FEATURE_KEYS = {
    "pm10": ("pm10_surface", "openmeteo_cams"),
    "no2": ("no2_surface", "openmeteo_cams"),
    "o3": ("o3_surface", "openmeteo_cams"),
    "so2": ("so2_surface", "openmeteo_cams"),
    "co": ("co_surface", "openmeteo_cams"),
}


def _last_known_key(code: str, lat: float, lon: float) -> str:
    return f"mframapa:v1:pollutant-last:{code}:{lat:.2f}:{lon:.2f}"


def _resolve_with_fallback(cache: RedisCache, code: str, lat: float, lon: float, value: Optional[float]) -> Dict[str, Any]:
    key = _last_known_key(code, lat, lon)
    now = datetime.now(timezone.utc).isoformat()

    if value is not None:
        cache.set(key, {"value": value, "updated_at": now}, _LAST_KNOWN_TTL)
        return {"value": value, "updated_at": now, "stale": False}

    cached = cache.get(key)
    if cached and cached.get("value") is not None:
        return {"value": cached["value"], "updated_at": cached.get("updated_at"), "stale": True}

    return {"value": None, "updated_at": None, "stale": True}


def build_pollutants(
    feats: Dict[str, Any],
    pm25: float,
    pm25_degraded: bool,
    pm25_source: str,
    lat: float,
    lon: float,
) -> List[Dict[str, Any]]:
    """Assemble the sorted pollutants[] array shown on the home tab.

    pm25 is passed in already resolved (satellite ensemble or its own
    fallback chain) — it is never re-fetched here, just folded into the same
    shape as the other five so the client renders one uniform list.
    """
    cache = RedisCache()
    out: List[Dict[str, Any]] = []

    for code in POLLUTANT_ORDER:
        if code == "pm25":
            resolved = _resolve_with_fallback(cache, code, lat, lon, pm25)
            source = pm25_source
            stale = pm25_degraded or resolved["stale"]
        else:
            feature_key, source = _FEATURE_KEYS[code]
            raw = feats.get(feature_key)
            raw = float(raw) if raw is not None else None
            resolved = _resolve_with_fallback(cache, code, lat, lon, raw)
            stale = resolved["stale"]

        value = resolved["value"]
        pct = pct_of_who_limit(code, value)
        severity = severity_for_pct(pct)
        guideline = WHO_2021_GUIDELINES[code]
        meta = POLLUTANT_META[code]

        entry: Dict[str, Any] = {
            "code": code,
            "name": meta["name"],
            "short_name": meta["short_name"],
            "value": round(value, 2) if value is not None else None,
            "unit": guideline["unit"],
            "who_limit": guideline["limit"],
            "who_limit_period": guideline["period"],
            "pct_of_limit": pct,
            "severity": severity,
            "source": source,
            "stale": stale,
            "updated_at": resolved["updated_at"],
        }
        if code == "pm25":
            entry["cigarette_equivalent"] = cigarette_equivalent(value)
        out.append(entry)

    # Most dangerous first; unresolved (pct None) sinks to the bottom rather
    # than the top so a missing reading never masquerades as the worst one.
    out.sort(key=lambda p: (p["pct_of_limit"] is None, -(p["pct_of_limit"] or 0)))
    return out
