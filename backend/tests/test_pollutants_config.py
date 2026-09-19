"""Unit tests for backend/config/pollutants.py helpers."""

from backend.config.pollutants import (
    POLLUTANT_INFO,
    POLLUTANT_META,
    POLLUTANT_ORDER,
    WHO_2021_GUIDELINES,
    cigarette_equivalent,
    pct_of_who_limit,
    severity_for_pct,
)


def test_all_six_pollutants_have_guidelines_meta_and_info():
    assert set(POLLUTANT_ORDER) == {"pm25", "pm10", "no2", "o3", "so2", "co"}
    for code in POLLUTANT_ORDER:
        assert code in WHO_2021_GUIDELINES
        assert code in POLLUTANT_META
        assert code in POLLUTANT_INFO
        info = POLLUTANT_INFO[code]
        assert info["what_it_is"]
        assert info["local_sources"]
        assert info["at_risk_groups"]
        assert set(info["actions_by_severity"]) >= {"good", "moderate", "high", "severe", "hazardous"}
        assert info["citations"]


def test_pct_of_who_limit_at_exactly_the_limit_is_100():
    limit = WHO_2021_GUIDELINES["no2"]["limit"]
    assert pct_of_who_limit("no2", limit) == 100.0


def test_pct_of_who_limit_none_value_returns_none():
    assert pct_of_who_limit("pm25", None) is None


def test_pct_of_who_limit_unknown_code_returns_none():
    assert pct_of_who_limit("radon", 10.0) is None


def test_severity_tiers_match_brief_cutoffs():
    assert severity_for_pct(0.0) == "good"
    assert severity_for_pct(99.9) == "good"
    assert severity_for_pct(100.0) == "moderate"
    assert severity_for_pct(199.9) == "moderate"
    assert severity_for_pct(200.0) == "high"
    assert severity_for_pct(349.9) == "high"
    assert severity_for_pct(350.0) == "severe"
    assert severity_for_pct(599.9) == "severe"
    assert severity_for_pct(600.0) == "hazardous"


def test_severity_for_pct_none_is_unknown():
    assert severity_for_pct(None) == "unknown"


def test_cigarette_equivalent_matches_berkeley_earth_approximation():
    # ~22 µg/m³ sustained over 24h ≈ 1 cigarette
    assert cigarette_equivalent(22.0) == 1.0
    assert cigarette_equivalent(88.0) == 4.0
    assert cigarette_equivalent(None) is None
