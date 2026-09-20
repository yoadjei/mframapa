"""Unit tests for backend/config/personalized_advice.py — the condition x
pollutant "what to do" rules engine."""

from backend.config.personalized_advice import (
    CONDITION_RULES,
    GENERAL_RULES,
    KNOWN_CONDITIONS,
    personalized_advice,
)

_LOW = {"no2": 10.0, "o3": 10.0, "so2": 10.0, "co": 10.0}


def test_known_conditions_match_sensitizing_conditions():
    from backend.config.pollutants import SENSITIZING_CONDITIONS

    assert KNOWN_CONDITIONS == SENSITIZING_CONDITIONS


def test_guest_with_low_readings_gets_no_advice():
    assert personalized_advice([], _LOW) == []


def test_guest_with_high_no2_gets_general_advice_only():
    result = personalized_advice([], {**_LOW, "no2": 150.0})
    assert [item["id"] for item in result] == ["general_no2"]


def test_co_safety_fires_for_guest_regardless_of_condition():
    result = personalized_advice([], {**_LOW, "co": 60.0})
    assert result[0]["id"] == "general_co_safety"
    assert result[0]["priority"] == 0


def test_asthma_inhaler_line_is_first_when_anything_elevated():
    result = personalized_advice(["asthma"], {**_LOW, "no2": 60.0})
    assert result[0]["id"] == "asthma_inhaler"


def test_co_override_still_shows_alongside_a_condition_specific_co_rule():
    result = personalized_advice(["pregnancy"], {**_LOW, "co": 80.0})
    ids = [item["id"] for item in result]
    assert "general_co_safety" in ids
    assert "pregnancy_co" in ids
    # the universal safety warning outranks the condition-specific one
    assert ids.index("general_co_safety") < ids.index("pregnancy_co")


def test_unknown_condition_code_is_ignored_not_raised():
    # a stale or malformed client payload shouldn't 500 the endpoint
    result = personalized_advice(["not_a_real_condition"], {**_LOW, "no2": 150.0})
    assert [item["id"] for item in result] == ["general_no2"]


def test_no_duplicate_ids_when_conditions_overlap_pollutants():
    result = personalized_advice(["asthma", "heart_condition"], {**_LOW, "no2": 150.0})
    ids = [item["id"] for item in result]
    assert len(ids) == len(set(ids))


def test_results_sorted_by_priority_ascending():
    result = personalized_advice(["asthma"], {"no2": 250.0, "o3": 250.0, "so2": 250.0, "co": 250.0})
    priorities = [item["priority"] for item in result]
    assert priorities == sorted(priorities)


def test_every_condition_rule_has_a_valid_min_tier_and_pollutant():
    valid_tiers = {"safe", "elevated", "high", "dangerous"}
    valid_pollutants = {"any", "no2", "o3", "so2", "co"}
    for rules in list(CONDITION_RULES.values()) + [GENERAL_RULES]:
        for rule in rules:
            assert rule["min_tier"] in valid_tiers
            assert rule["pollutant"] in valid_pollutants
            assert rule["text"]
            assert "%" not in rule["text"]  # no invented/hardcoded numbers in copy


def test_no_advice_text_claims_a_mask_protects_against_gases():
    for rules in list(CONDITION_RULES.values()) + [GENERAL_RULES]:
        for rule in rules:
            text = (rule["text"] + " " + (rule.get("detail") or "")).lower()
            if "mask" in text:
                assert "won't protect" in text or "will not protect" in text or "does not" in text
