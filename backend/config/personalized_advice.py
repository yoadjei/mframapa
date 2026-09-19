"""Condition x pollutant -> "what to do" rules engine for the home tab.

A generic user and an asthmatic looking at the same reading need genuinely
different instructions, not the same paragraph with a warning label on top.
This module is the single place that difference lives — UI code never
hardcodes advice text; it calls personalized_advice() and renders what comes
back.

Scope is deliberately narrow: NO2, O3, SO2 and CO. PM2.5 stays the hero AQI
metric (and already drives tightened_category() below) but does not feed
this engine — see the "Pollutant scope" note in the product brief this
implements.

Content is sourced from:
- WHO 2021 Air Quality Guidelines: https://www.who.int/publications/i/item/9789240034228
- US EPA AirNow, "Air Quality and Your Health": https://www.airnow.gov/air-quality-and-health/
- American Lung Association, "Asthma and Outdoor Air Quality"
- American Heart Association, air pollution and cardiovascular risk guidance
- WHO / ACOG guidance on air pollution and pregnancy outcomes (NO2 linked to
  low birth weight and preterm birth; CO crosses the placenta)
No dosing or drug names are ever given — advice says "carry your reliever
inhaler", never "take two puffs". That line belongs to a doctor, not this
app.

Mask note (also surfaced verbatim to users, see PERSONALIZED_MASK_NOTE):
N95 masks filter particles. They do NOT filter NO2, O3, SO2 or CO — for
gases the real protection is distance, timing and ventilation. No advice
item in this file should ever claim a mask protects against CO.
"""

from typing import Any, Dict, List, Optional, TypedDict

# Same 4-tier scale as the "What's in your air" cards (see
# frontend-pwa/src/utils/colors.js factorFillColor/factorStatusKey and
# FACTOR_FILL_BREAKPOINTS) — "elevated" here means exactly what it means on
# those cards, so a rule's trigger lines up with what the user is looking at.
_TIER_ORDER = ["safe", "elevated", "high", "dangerous"]
_TIER_BREAKPOINTS = [0.0, 50.0, 100.0, 200.0]

_ADVICE_POLLUTANTS = ("no2", "o3", "so2", "co")

PERSONALIZED_DISCLAIMER = "General guidance, not medical advice. Follow your doctor's plan."

PERSONALIZED_MASK_NOTE = (
    "N95 masks help with particles. They do not filter NO2, O3, SO2 or CO — "
    "for gases, distance, timing and ventilation are the real protection."
)


class AdviceItem(TypedDict):
    id: str
    icon: str
    text: str
    detail: Optional[str]
    priority: int  # lower shows first; 0 is reserved for the CO safety override


def _tier_for_pct(pct: Optional[float]) -> str:
    if pct is None:
        return "safe"
    tier = _TIER_ORDER[0]
    for name, cutoff in zip(_TIER_ORDER, _TIER_BREAKPOINTS):
        if pct >= cutoff:
            tier = name
    return tier


def _meets(tier: str, minimum: str) -> bool:
    return _TIER_ORDER.index(tier) >= _TIER_ORDER.index(minimum)


# Rules that apply to everyone regardless of profile — a guest with no
# health conditions selected still gets these ("general public" per the
# brief). CO safety in particular must fire for anyone, sensitized or not:
# it is not a chronic-condition risk, it is an acute poisoning risk.
GENERAL_RULES: List[Dict[str, Any]] = [
    {
        "id": "general_co_safety", "pollutant": "co", "min_tier": "elevated", "priority": 0,
        "icon": "flame",
        "text": "Never run a generator or charcoal stove indoors, in a garage, or near an open window.",
        "detail": "CO has no smell or colour — you won't notice it building up. Headache, "
                  "dizziness, nausea or confusion in a room with a generator or stove means "
                  "get everyone outside into fresh air immediately.",
    },
    {
        "id": "general_no2", "pollutant": "no2", "min_tier": "high", "priority": 20,
        "icon": "car",
        "text": "Traffic fumes are high today. Limit time near busy roads.",
        "detail": None,
    },
    {
        "id": "general_o3", "pollutant": "o3", "min_tier": "high", "priority": 20,
        "icon": "sun",
        "text": "Ground-level ozone is high this afternoon. Shift outdoor activity to morning or evening.",
        "detail": None,
    },
    {
        "id": "general_so2", "pollutant": "so2", "min_tier": "high", "priority": 20,
        "icon": "factory",
        "text": "Sulfur dioxide is high — avoid generator exhaust and industrial areas.",
        "detail": None,
    },
]

# Per-condition rules. "any" as the pollutant means the rule triggers off
# whichever of the four gases is currently worst. Keys must match
# SENSITIZING_CONDITIONS below exactly — the frontend health-profile forms
# use the same codes.
CONDITION_RULES: Dict[str, List[Dict[str, Any]]] = {
    "asthma": [
        {"id": "asthma_inhaler", "pollutant": "any", "min_tier": "elevated", "priority": 1, "icon": "wind",
         "text": "Carry your reliever inhaler before you leave.",
         "detail": "Take your preventer if prescribed, and bring a spacer if you use one."},
        {"id": "asthma_warning_signs", "pollutant": "any", "min_tier": "elevated", "priority": 2, "icon": "alert",
         "text": "Wheezing, chest tightness, or can't finish a sentence in one breath? Get indoors and use your reliever.",
         "detail": "If your reliever isn't working within a few minutes, get medical help."},
        {"id": "asthma_stay_in", "pollutant": "any", "min_tier": "dangerous", "priority": 3, "icon": "home",
         "text": "Today is a day to stay in if you can.", "detail": None},
        {"id": "asthma_so2", "pollutant": "so2", "min_tier": "high", "priority": 4, "icon": "factory",
         "text": "SO2 can tighten your airways within minutes — avoid industrial areas and generator exhaust.",
         "detail": "Get indoors if your chest starts to feel tight."},
        {"id": "asthma_no2", "pollutant": "no2", "min_tier": "high", "priority": 5, "icon": "car",
         "text": "NO2 is high — stay off busy roads and away from idling vehicles or generators.",
         "detail": "Delay leaving until after peak traffic if you can."},
        {"id": "asthma_o3", "pollutant": "o3", "min_tier": "high", "priority": 5, "icon": "sun",
         "text": "Ozone is high — avoid outdoor activity in the afternoon sun.",
         "detail": "Shift errands to morning or evening, when ozone is lower."},
        {"id": "asthma_windows", "pollutant": "any", "min_tier": "elevated", "priority": 8, "icon": "home",
         "text": "Keep windows closed on the side facing traffic.", "detail": None},
    ],
    "heart_condition": [
        {"id": "heart_warning_signs", "pollutant": "any", "min_tier": "elevated", "priority": 2, "icon": "alert",
         "text": "Chest pain, unusual breathlessness, or palpitations? Seek care immediately.", "detail": None},
        {"id": "heart_co", "pollutant": "co", "min_tier": "elevated", "priority": 3, "icon": "flame",
         "text": "CO reduces how much oxygen your blood can carry — avoid generator exhaust entirely.",
         "detail": "This is especially dangerous with existing heart disease."},
        {"id": "heart_no2_exertion", "pollutant": "no2", "min_tier": "high", "priority": 5, "icon": "car",
         "text": "NO2 is high — avoid outdoor exertion and stay away from traffic.", "detail": None},
        {"id": "heart_medication", "pollutant": "any", "min_tier": "elevated", "priority": 8, "icon": "home",
         "text": "Keep your medication routine as usual today.", "detail": None},
    ],
    "pregnancy": [
        {"id": "pregnancy_co", "pollutant": "co", "min_tier": "elevated", "priority": 1, "icon": "flame",
         "text": "Never sit near a running generator — CO crosses the placenta and reduces oxygen to your baby.",
         "detail": None},
        {"id": "pregnancy_cooking", "pollutant": "any", "min_tier": "elevated", "priority": 3, "icon": "home",
         "text": "Don't cook with charcoal or firewood in an unventilated space.", "detail": None},
        {"id": "pregnancy_no2", "pollutant": "no2", "min_tier": "high", "priority": 5, "icon": "car",
         "text": "NO2 is linked to low birth weight and preterm birth — avoid roadside walking during peak traffic.",
         "detail": None},
        {"id": "pregnancy_indoor", "pollutant": "any", "min_tier": "high", "priority": 8, "icon": "home",
         "text": "Prioritize indoor activity today.", "detail": None},
    ],
    "elderly_household": [
        {"id": "elderly_co", "pollutant": "co", "min_tier": "elevated", "priority": 2, "icon": "flame",
         "text": "Keep generator exhaust well away from their windows and doors.", "detail": None},
        {"id": "elderly_check_in", "pollutant": "any", "min_tier": "dangerous", "priority": 3, "icon": "alert",
         "text": "Check on them today — reduced lung and heart reserve makes hazardous air riskier for older household members.",
         "detail": None},
        {"id": "elderly_errands", "pollutant": "any", "min_tier": "high", "priority": 5, "icon": "home",
         "text": "Limit their outdoor errands to the cleanest hours today.", "detail": None},
        {"id": "elderly_medication", "pollutant": "any", "min_tier": "elevated", "priority": 8, "icon": "home",
         "text": "Make sure their medication is on hand.", "detail": None},
    ],
    "young_children": [
        {"id": "children_co", "pollutant": "co", "min_tier": "elevated", "priority": 1, "icon": "flame",
         "text": "Never run a charcoal stove or generator in the same room as children, or in an attached space.",
         "detail": None},
        {"id": "children_indoors", "pollutant": "any", "min_tier": "high", "priority": 4, "icon": "home",
         "text": "Keep children indoors today — they breathe faster and take in more air per body weight, so gases hit them harder.",
         "detail": None},
        {"id": "children_play", "pollutant": "any", "min_tier": "elevated", "priority": 6, "icon": "home",
         "text": "No outdoor play near roads today.", "detail": None},
    ],
    "outdoor_worker": [
        {"id": "worker_mask_note", "pollutant": "any", "min_tier": "elevated", "priority": 4, "icon": "wind",
         "text": "A mask won't protect you from these gases — distance and timing are your real protection.",
         "detail": None},
        {"id": "worker_position", "pollutant": "no2", "min_tier": "high", "priority": 5, "icon": "car",
         "text": "Work on the side away from traffic flow where possible.", "detail": None},
        {"id": "worker_breaks", "pollutant": "any", "min_tier": "high", "priority": 6, "icon": "home",
         "text": "Take breaks away from the roadside and away from idling engines.", "detail": None},
        {"id": "worker_hydrate", "pollutant": "any", "min_tier": "elevated", "priority": 9, "icon": "home",
         "text": "Stay hydrated and shorten your peak-hour exposure where you can.", "detail": None},
    ],
}

# Kept in sync by hand with frontend-pwa/src/features/healthProfile/healthConditions.js
# and backend/config/pollutants.py SENSITIZING_CONDITIONS — same six codes.
KNOWN_CONDITIONS = frozenset(CONDITION_RULES.keys())


def _worst_tier(pcts: Dict[str, Optional[float]]) -> str:
    worst = "safe"
    for code in _ADVICE_POLLUTANTS:
        tier = _tier_for_pct(pcts.get(code))
        if _TIER_ORDER.index(tier) > _TIER_ORDER.index(worst):
            worst = tier
    return worst


def personalized_advice(
    health_conditions: Optional[List[str]],
    pollutant_pcts: Dict[str, Optional[float]],
) -> List[AdviceItem]:
    """Sorted, deduplicated advice for a profile against the current NO2/O3/SO2/CO
    readings (each a % of its WHO limit, e.g. from pollutants[] pct_of_limit).

    Guests and profiles with no sensitizing condition get GENERAL_RULES only
    ("general public" per the brief) — never an empty screen, just the
    default set. CO safety always applies on top of whatever a condition
    already contributes, since it's an acute risk unrelated to any specific
    diagnosis.
    """
    worst = _worst_tier(pollutant_pcts)
    conditions = [c for c in (health_conditions or []) if c in KNOWN_CONDITIONS]

    seen: Dict[str, AdviceItem] = {}

    def _collect(rules: List[Dict[str, Any]]) -> None:
        for rule in rules:
            if rule["id"] in seen:
                continue
            tier = worst if rule["pollutant"] == "any" else _tier_for_pct(pollutant_pcts.get(rule["pollutant"]))
            if _meets(tier, rule["min_tier"]):
                seen[rule["id"]] = AdviceItem(
                    id=rule["id"], icon=rule["icon"], text=rule["text"],
                    detail=rule.get("detail"), priority=rule["priority"],
                )

    _collect(GENERAL_RULES)
    for condition in conditions:
        _collect(CONDITION_RULES.get(condition, []))

    return sorted(seen.values(), key=lambda item: item["priority"])
