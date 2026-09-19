"""
DataOrchestrator — resolves all model features using a priority-ordered
fallback hierarchy across ERA5, Sentinel-5P, MODIS, Open-Meteo, and NASA POWER.

Fallback logic:
    For each required feature, try sources in order until one succeeds.
    A source is only called once per request regardless of how many features
    it provides (results are cached in-memory for the duration of the call).

Reliability scoring:
    Per-source success/failure counters are maintained for the lifetime of
    the orchestrator instance — useful for monitoring and alerting.
"""

import logging
from typing import Dict, Any, Optional

from .era5 import ERA5DataSource
from .sentinel5p import Sentinel5PDataSource
from .modis import MODISDataSource
from .viirs import VIIRSDataSource
from .open_meteo import OpenMeteoDataSource
from .nasa_power import NASAPowerDataSource
from .ndvi import NDVIDataSource
from .night_lights import NightLightsDataSource
from .osm_roads import OSMRoadsDataSource
from .openaq import OpenAQDataSource

logger = logging.getLogger(__name__)

# Maps output feature → ordered list of (source_name, source_key)
# First source in each list is preferred; subsequent entries are fallbacks.
_FALLBACK_PLAN: Dict[str, list] = {
    # ── Planetary boundary layer ──────────────────────────────────────────
    "pblh": [
        ("ERA5", "pblh"),
    ],
    # ── Meteorology ───────────────────────────────────────────────────────
    "temperature_2m": [
        ("ERA5", "temperature_2m"),
        ("OpenMeteo", "temperature_2m"),
        ("NASA-POWER", "temperature_2m"),
    ],
    "relative_humidity": [
        ("ERA5", "relative_humidity"),
        ("OpenMeteo", "relative_humidity"),
        ("NASA-POWER", "relative_humidity"),
    ],
    "u_component_of_wind_10m": [
        ("ERA5", "u_component_of_wind_10m"),
        ("OpenMeteo", "u_component_of_wind_10m"),
        ("NASA-POWER", "u_component_of_wind_10m"),
    ],
    "v_component_of_wind_10m": [
        ("ERA5", "v_component_of_wind_10m"),
        ("OpenMeteo", "v_component_of_wind_10m"),
        ("NASA-POWER", "v_component_of_wind_10m"),
    ],
    "surface_pressure": [
        ("OpenMeteo", "surface_pressure"),
        ("NASA-POWER", "surface_pressure"),
    ],
    "precipitation": [
        ("OpenMeteo", "precipitation"),
        ("NASA-POWER", "precipitation"),
    ],
    "dew_point_2m": [
        ("OpenMeteo", "dew_point_2m"),
    ],
    "cloud_cover": [
        ("OpenMeteo", "cloud_cover"),
    ],
    # ── Trace gases ───────────────────────────────────────────────────────
    "no2_tropospheric_column": [
        ("Sentinel-5P", "no2_tropospheric_column"),
        ("OpenMeteo", "no2_surface"),
    ],
    "so2_total_column": [
        ("Sentinel-5P", "so2_total_column"),
        ("OpenMeteo", "so2_surface"),
    ],
    "co_total_column": [
        ("Sentinel-5P", "co_total_column"),
        ("OpenMeteo", "co_surface"),
    ],
    # ── Aerosols ──────────────────────────────────────────────────────────
    "aerosol_optical_depth": [
        ("Sentinel-5P", "aerosol_optical_depth"),
        ("VIIRS-MAIAC", "aerosol_optical_depth"),
        ("MODIS-MAIAC", "aerosol_optical_depth"),
        ("OpenMeteo", "aerosol_optical_depth"),
    ],
    # ── Particulates ─────────────────────────────────────────────────────
    "pm10_surface": [
        ("OpenMeteo", "pm10_surface"),
        ("OpenAQ", "openaq_pm10"),
    ],
    "pm25_surface": [
        ("OpenMeteo", "pm25_surface"),
        ("OpenAQ", "openaq_pm25"),
    ],
    "dust_surface": [
        ("OpenMeteo", "dust_surface"),
    ],
    # ── Surface-level gas concentrations (display only) ─────────────────────
    # These feed the multi-pollutant cards, which compare against WHO's
    # surface-concentration guidelines. They are deliberately kept separate
    # from no2_tropospheric_column / so2_total_column / co_total_column above,
    # which are satellite COLUMN densities used as ML model inputs and are not
    # in the same unit as a WHO surface guideline.
    "no2_surface": [
        ("OpenMeteo", "no2_surface"),
    ],
    "so2_surface": [
        ("OpenMeteo", "so2_surface"),
    ],
    "co_surface": [
        ("OpenMeteo", "co_surface"),
    ],
    "o3_surface": [
        ("OpenMeteo", "o3_surface"),
    ],
}

_SOURCE_NAMES = [
    "ERA5",
    "Sentinel-5P",
    "VIIRS-MAIAC",
    "MODIS-MAIAC",
    "OpenMeteo",
    "NASA-POWER",
    "NDVI-Composite",
    "VIIRS-NightLights",
    "OSM-Roads",
    "OpenAQ",
]


class DataOrchestrator:
    """
    Resolves all model features with graceful degradation.

    Usage:
        orch = DataOrchestrator()
        features = orch.get_features(lat=5.6037, lon=-0.1870, date="2024-06-01")
    """

    def __init__(self):
        self._sources = {
            "ERA5": ERA5DataSource(),
            "Sentinel-5P": Sentinel5PDataSource(),
            "VIIRS-MAIAC": VIIRSDataSource(),
            "MODIS-MAIAC": MODISDataSource(),
            "OpenMeteo": OpenMeteoDataSource(),
            "NASA-POWER": NASAPowerDataSource(),
            "NDVI-Composite": NDVIDataSource(),
            "VIIRS-NightLights": NightLightsDataSource(),
            "OSM-Roads": OSMRoadsDataSource(),
            "OpenAQ": OpenAQDataSource(),
        }
        # Reliability counters: {source_name: {"success": int, "failure": int}}
        self._counters = {
            name: {"success": 0, "failure": 0} for name in _SOURCE_NAMES
        }

    def get_features(self, lat: float, lon: float, date: str) -> Dict[str, Any]:
        """
        Fetch all features for (lat, lon, date).

        Returns a dict with all planned features; unresolvable ones are None.
        """
        logger.info(
            "DataOrchestrator: resolving features for (%.4f, %.4f) on %s", lat, lon, date
        )

        # Per-call cache: source_name → fetch result (populated lazily)
        _call_cache: Dict[str, Optional[Dict]] = {}

        def _fetch_source(name: str) -> Optional[Dict]:
            if name in _call_cache:
                return _call_cache[name]
            src = self._sources[name]
            if not src.is_available:
                _call_cache[name] = None
                return None
            try:
                result = src.fetch_data(lat, lon, date)
                self._counters[name]["success"] += 1
                _call_cache[name] = result
                return result
            except Exception as e:
                logger.warning(
                    "DataOrchestrator: %s failed for (%.4f, %.4f, %s) — %s",
                    name, lat, lon, date, e,
                )
                self._counters[name]["failure"] += 1
                _call_cache[name] = None
                return None

        features: Dict[str, Any] = {}
        for feature, plan in _FALLBACK_PLAN.items():
            resolved = None
            for source_name, source_key in plan:
                data = _fetch_source(source_name)
                if data and data.get(source_key) is not None:
                    resolved = data[source_key]
                    logger.debug(
                        "DataOrchestrator: %s → resolved via %s", feature, source_name
                    )
                    break
            features[feature] = resolved

        missing = [k for k, v in features.items() if v is None]
        if missing:
            logger.warning(
                "DataOrchestrator: could not resolve %d feature(s): %s", len(missing), missing
            )
        else:
            logger.info("DataOrchestrator: all features resolved.")

        return features

    @property
    def reliability_scores(self) -> Dict[str, float]:
        """
        Returns per-source reliability as success / (success + failure).
        Returns 1.0 for sources never called.
        """
        scores = {}
        for name, c in self._counters.items():
            total = c["success"] + c["failure"]
            scores[name] = round(c["success"] / total, 3) if total > 0 else 1.0
        return scores

    @property
    def available_sources(self) -> list:
        return [name for name, src in self._sources.items() if src.is_available]
