"""
ERA5 reanalysis connector (Copernicus Climate Data Store).

Fetches:
    pblh                    — Planetary Boundary Layer Height (m)
    temperature_2m          — 2 m air temperature (°C)
    relative_humidity       — 2 m relative humidity (%)  [derived]
    u_component_of_wind_10m — U-component of 10 m wind (m/s)
    v_component_of_wind_10m — V-component of 10 m wind (m/s)

Requires:
    pip install cdsapi xarray netCDF4
    ~/.cdsapirc  OR  env vars CDSAPI_URL + CDSAPI_KEY
"""

import logging
import os
import tempfile
from datetime import datetime
from typing import Dict, Any, List, Optional

from .base import DataSource
from backend.utils.retry import with_retry

logger = logging.getLogger(__name__)

_VARIABLES = [
    "boundary_layer_height",
    "2m_temperature",
    "2m_dewpoint_temperature",
    "10m_u_component_of_wind",
    "10m_v_component_of_wind",
]


class ERA5DataSource(DataSource):
    """
    Downloads hourly ERA5 data for a single day via the CDS API,
    extracts the nearest grid point, and returns daily means.
    """

    def __init__(self):
        try:
            import cdsapi
            url = os.environ.get("CDSAPI_URL")
            key = os.environ.get("CDSAPI_KEY")
            # cdsapi.Client defaults to retry_max=500 / sleep_max=120 — its own
            # internal retry loop, completely separate from (and not bounded by)
            # backend.utils.retry.with_retry below. A slow/degraded CDS API can
            # therefore block a single self.client.retrieve() call for up to
            # ~500*120s (hours), starving the request thread and never giving
            # the ERA5→OpenMeteo→NASA-POWER fallback chain a chance to run.
            # One attempt here, bounded by `timeout` (HTTP read timeout,
            # seconds) — our own with_retry(max_attempts=3) is the retry layer.
            client_kwargs = {"quiet": True, "retry_max": 1, "timeout": 30}
            if url and key:
                self.client = cdsapi.Client(url=url, key=key, **client_kwargs)
            else:
                self.client = cdsapi.Client(**client_kwargs)   # falls back to ~/.cdsapirc
        except ImportError:
            # expected in the lean serving image — openmeteo covers these features.
            logger.debug("ERA5: 'cdsapi' not installed; source disabled")
            self.client = None
        except Exception as e:
            logger.warning("ERA5: could not initialise CDS client — %s", e)
            self.client = None

    @property
    def source_name(self) -> str:
        return "ERA5"

    @property
    def provided_features(self) -> List[str]:
        return [
            "pblh",
            "temperature_2m",
            "relative_humidity",
            "u_component_of_wind_10m",
            "v_component_of_wind_10m",
        ]

    @property
    def is_available(self) -> bool:
        return self.client is not None

    def fetch_data(self, lat: float, lon: float, date: str) -> Dict[str, Any]:
        if not self.is_available:
            raise RuntimeError(
                "ERA5DataSource: cdsapi not installed or credentials missing."
            )
        self._validate_inputs(lat, lon, date)
        return self._fetch_with_retry(lat, lon, date)

    @with_retry(max_attempts=3, backoff_factor=2, timeout=180)
    def _fetch_with_retry(self, lat: float, lon: float, date: str) -> Dict[str, Any]:
        import xarray as xr

        parsed = datetime.strptime(date, "%Y-%m-%d")
        year, month, day = str(parsed.year), f"{parsed.month:02d}", f"{parsed.day:02d}"

        with tempfile.NamedTemporaryFile(suffix=".nc", delete=False) as tmp:
            tmp_path = tmp.name

        try:
            self.client.retrieve(
                "reanalysis-era5-single-levels",
                {
                    "product_type": "reanalysis",
                    "variable":     _VARIABLES,
                    "year":         year,
                    "month":        month,
                    "day":          day,
                    "time":         [f"{h:02d}:00" for h in range(24)],
                    "area":         [lat + 0.5, lon - 0.5, lat - 0.5, lon + 0.5],
                    "format":       "netcdf",
                },
                tmp_path,
            )

            ds = xr.open_dataset(tmp_path)
            # Select nearest grid point
            point = ds.sel(latitude=lat, longitude=lon, method="nearest")

            def mean(var: str) -> Optional[float]:
                try:
                    return float(point[var].mean().values)
                except Exception:
                    return None

            t2m_k  = mean("t2m")    # Kelvin
            d2m_k  = mean("d2m")    # dewpoint Kelvin
            pblh   = mean("blh")
            u10    = mean("u10")
            v10    = mean("v10")

            temp_c = round(t2m_k - 273.15, 2) if t2m_k is not None else None
            rh     = self._magnus_rh(t2m_k, d2m_k)

            ds.close()

        finally:
            try:
                os.remove(tmp_path)
            except OSError:
                pass

        return {
            "pblh":                    round(pblh, 2) if pblh else None,
            "temperature_2m":          temp_c,
            "relative_humidity":       rh,
            "u_component_of_wind_10m": round(u10, 4) if u10 else None,
            "v_component_of_wind_10m": round(v10, 4) if v10 else None,
        }

    @staticmethod
    def _magnus_rh(t_k: Optional[float], td_k: Optional[float]) -> Optional[float]:
        """August-Roche-Magnus approximation for relative humidity."""
        if t_k is None or td_k is None:
            return None
        t  = t_k  - 273.15
        td = td_k - 273.15
        es  = 6.112 * (17.67 * t  / (t  + 243.5))
        eds = 6.112 * (17.67 * td / (td + 243.5))
        rh  = 100.0 * eds / es
        return round(max(0.0, min(100.0, rh)), 2)

    @staticmethod
    def _validate_inputs(lat: float, lon: float, date: str) -> None:
        if not (-90 <= lat <= 90):
            raise ValueError(f"ERA5: latitude {lat} out of range [-90, 90]")
        if not (-180 <= lon <= 180):
            raise ValueError(f"ERA5: longitude {lon} out of range [-180, 180]")
        try:
            datetime.strptime(date, "%Y-%m-%d")
        except ValueError:
            raise ValueError(f"ERA5: invalid date '{date}' — expected YYYY-MM-DD")
