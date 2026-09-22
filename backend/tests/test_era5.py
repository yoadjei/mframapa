"""Tests for ERA5DataSource (lazy cdsapi import)."""

import sys
import pytest
from unittest.mock import MagicMock, patch


def _make_era5(cdsapi_available=True):
    """Build ERA5DataSource with cdsapi mocked in sys.modules."""
    mock_cdsapi = MagicMock()
    if not cdsapi_available:
        mock_cdsapi.Client.side_effect = ImportError("no cdsapi")

    with patch.dict(sys.modules, {"cdsapi": mock_cdsapi}):
        # Re-import so the lazy __init__ picks up our mock
        if "backend.data_sources.era5" in sys.modules:
            del sys.modules["backend.data_sources.era5"]
        from backend.data_sources.era5 import ERA5DataSource
        src = ERA5DataSource()

    return src, mock_cdsapi


class TestERA5DataSource:

    def test_initialization(self):
        src, _ = _make_era5(cdsapi_available=True)
        assert src.client is not None

    def test_not_available_when_cdsapi_missing(self):
        mock_cdsapi = MagicMock()
        mock_cdsapi.Client.side_effect = ImportError

        with patch.dict(sys.modules, {"cdsapi": None}):
            if "backend.data_sources.era5" in sys.modules:
                del sys.modules["backend.data_sources.era5"]
            from backend.data_sources.era5 import ERA5DataSource
            src = ERA5DataSource()

        assert src.is_available is False

    def test_fetch_data_raises_runtime_error_without_client(self):
        src, _ = _make_era5()
        src.client = None
        with pytest.raises(RuntimeError):
            src.fetch_data(5.6, -0.2, "2024-06-01")

    def test_fetch_data_invalid_date_raises_value_error(self):
        src, _ = _make_era5()
        with pytest.raises(ValueError, match="invalid date"):
            src.fetch_data(5.6, -0.2, "not-a-date")

    def test_fetch_data_invalid_latitude_raises_value_error(self):
        src, _ = _make_era5()
        with pytest.raises(ValueError, match="latitude"):
            src.fetch_data(999.0, -0.2, "2024-06-01")

    def test_provided_features_complete(self):
        src, _ = _make_era5()
        features = src.provided_features
        assert "pblh" in features
        assert "temperature_2m" in features
        assert "relative_humidity" in features
        assert "u_component_of_wind_10m" in features
        assert "v_component_of_wind_10m" in features

    def test_client_bounds_cdsapi_internal_retry(self):
        """cdsapi.Client defaults to retry_max=500/sleep_max=120 — its own
        internal retry loop, which backend.utils.retry.with_retry cannot bound
        (SIGALRM-based timeouts are a no-op outside the main thread, i.e. in
        every real FastAPI request/background-thread call). A degraded CDS API
        must fail in seconds, not silently block a worker thread for hours."""
        src, mock_cdsapi = _make_era5(cdsapi_available=True)
        assert src.client is not None
        _, kwargs = mock_cdsapi.Client.call_args
        assert kwargs.get("retry_max") == 1
        assert kwargs.get("timeout") is not None and kwargs["timeout"] <= 60
