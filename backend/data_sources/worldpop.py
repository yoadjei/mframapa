"""
WorldPop population-density connector (v1 stats API, no auth).

Fetches total population in a small bbox around the point via the synchronous
stats endpoint (runasync=false returns the result inline in ~2s), then converts
the count to people/km^2.

API:  https://api.worldpop.org/v1/services/stats
Data: WorldPop wpgppop 2020 population-count mosaic
"""

import json
import logging
import math
from typing import Dict, Any, List, Optional

import requests

from .base import DataSource

logger = logging.getLogger(__name__)

_STATS_URL = "https://api.worldpop.org/v1/services/stats"
_DATASET   = "wpgppop"   # population count mosaic; the old 'wpgp' alias 422s
_YEAR      = "2020"
# The sync endpoint normally answers in ~2s (see module docstring). This used
# to be 60s, which meant a WorldPop outage held the whole /predict request
# open until the client's own timeout fired first (mobile axios: 45s) and the
# user saw a generic "failed to fetch" error instead of a fast degraded
# response. 10s gives real slowness room without blocking past client timeouts.
_TIMEOUT   = 10
_DELTA     = 0.01        # ~1.1 km half-box around the point


class WorldPopDataSource(DataSource):
    """WorldPop v1 stats API connector — no credentials required."""

    @property
    def source_name(self) -> str:
        return "WorldPop"

    @property
    def provided_features(self) -> List[str]:
        return ["population_density"]

    @property
    def is_available(self) -> bool:
        return True

    def fetch_data(self, lat: float, lon: float, date: str) -> Dict[str, Any]:
        self._validate_inputs(lat, lon)
        return {"population_density": self._query(lat, lon)}

    def _query(self, lat: float, lon: float) -> Optional[float]:
        geojson = {
            "type": "Polygon",
            "coordinates": [[
                [lon - _DELTA, lat - _DELTA],
                [lon + _DELTA, lat - _DELTA],
                [lon + _DELTA, lat + _DELTA],
                [lon - _DELTA, lat + _DELTA],
                [lon - _DELTA, lat - _DELTA],
            ]],
        }
        params = {
            "dataset":  _DATASET,
            "year":     _YEAR,
            "geojson":  json.dumps(geojson),
            "runasync": "false",
        }
        try:
            resp = requests.get(_STATS_URL, params=params, timeout=_TIMEOUT)
            if resp.status_code == 422:
                return None
            resp.raise_for_status()
            data = resp.json()
        except requests.RequestException as e:
            raise ConnectionError(f"WorldPop: request failed — {e}") from e

        total = self._extract_population(data)
        if total is None:
            logger.warning("WorldPop: no population in response: %s", str(data)[:200])
            return None
        area = self._box_area_km2(lat, _DELTA)
        return round(total / area, 2) if area > 0 else None

    @staticmethod
    def _extract_population(data: dict) -> Optional[float]:
        """Pull total_population from a wpgppop stats response."""
        try:
            return float(data["data"]["total_population"])
        except (KeyError, TypeError, ValueError):
            return None

    @staticmethod
    def _box_area_km2(lat: float, delta: float) -> float:
        """Area of the 2*delta-degree box around the point, in km^2."""
        side_lat_km = 2 * delta * 111.32
        side_lon_km = 2 * delta * 111.32 * math.cos(math.radians(lat))
        return side_lat_km * side_lon_km

    @staticmethod
    def _validate_inputs(lat: float, lon: float) -> None:
        if not (-90 <= lat <= 90):
            raise ValueError(f"WorldPop: latitude {lat} out of range [-90, 90]")
        if not (-180 <= lon <= 180):
            raise ValueError(f"WorldPop: longitude {lon} out of range [-180, 180]")
