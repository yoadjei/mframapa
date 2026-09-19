"""Single source of truth for multi-pollutant thresholds, severity tiers, and
the health copy shown on pollutant cards. UI code must never hardcode a limit,
a cutoff, or a health claim — it reads everything from here.

Guideline values are the WHO 2021 Air Quality Guidelines:
https://www.who.int/publications/i/item/9789240034228
All concentrations are surface-level µg/m³ (or mg/m³ for CO, converted below),
matching what Open-Meteo's CAMS air-quality API and OpenAQ ground stations
report — NOT the satellite column-density features used as ML model inputs
(those measure a different physical quantity and are not comparable to a
surface guideline).

Health-effect summaries reflect established WHO/US EPA public health guidance
(WHO 2021 AQG technical summary; US EPA AirNow "Air Quality and Your Health"
and Integrated Science Assessments) and are deliberately general rather than
inventing numbers we cannot cite.
"""

from typing import Any, Dict, List, Optional

# Berkeley Earth's approximation: sustained exposure to ~22 µg/m³ PM2.5 over a
# day carries roughly the same excess mortality risk as smoking one cigarette.
# https://berkeleyearth.org/air-pollution-and-cigarette-equivalence/
# Presented in the app as a labeled approximation, never as an exact figure.
CIGARETTE_EQUIVALENT_PM25_UG = 22.0

# WHO 2021 guideline level per pollutant. Values already in the display unit.
WHO_2021_GUIDELINES: Dict[str, Dict[str, Any]] = {
    "pm25": {"limit": 15.0, "unit": "µg/m³", "period": "24-hour"},
    "pm10": {"limit": 45.0, "unit": "µg/m³", "period": "24-hour"},
    "no2": {"limit": 25.0, "unit": "µg/m³", "period": "24-hour"},
    "o3": {"limit": 100.0, "unit": "µg/m³", "period": "8-hour"},
    "so2": {"limit": 40.0, "unit": "µg/m³", "period": "24-hour"},
    # WHO states CO as 4 mg/m³ over 24h; stored here in µg/m³ so every
    # pollutant shares one unit for the ratio-to-limit math.
    "co": {"limit": 4000.0, "unit": "µg/m³", "period": "24-hour"},
}

# Display order used whenever pollutants are NOT being sorted by severity.
POLLUTANT_ORDER: List[str] = ["pm25", "pm10", "no2", "o3", "so2", "co"]

POLLUTANT_META: Dict[str, Dict[str, str]] = {
    "pm25": {"name": "Fine particulate matter", "short_name": "PM2.5"},
    "pm10": {"name": "Coarse particulate matter", "short_name": "PM10"},
    "no2": {"name": "Nitrogen dioxide", "short_name": "NO2"},
    "o3": {"name": "Ground-level ozone", "short_name": "O3"},
    "so2": {"name": "Sulfur dioxide", "short_name": "SO2"},
    "co": {"name": "Carbon monoxide", "short_name": "CO"},
}

# % of the WHO limit at which a card moves to the next severity tier, in
# ascending order. The green/yellow/orange/red cutoffs come from the product
# brief; WHO does not define a "hazardous" ratio, so 600% is a placeholder —
# confirm with the team before treating it as final.
SEVERITY_CUTOFFS: List[tuple] = [
    ("good", 0.0),
    ("moderate", 100.0),
    ("high", 200.0),
    ("severe", 350.0),
    ("hazardous", 600.0),
]

_WHO_CITATION = "WHO 2021 Air Quality Guidelines"
_EPA_CITATION = "US EPA AirNow — Air Quality and Your Health"

POLLUTANT_INFO: Dict[str, Dict[str, Any]] = {
    "pm25": {
        "what_it_is": (
            "Solid and liquid particles 2.5 microns or smaller — small enough to "
            "pass through the lungs into the bloodstream."
        ),
        "local_sources": [
            "Vehicle exhaust",
            "Burning refuse",
            "Charcoal and wood cooking fires",
            "Harmattan dust",
        ],
        "body_effects": (
            "Long-term exposure is linked to heart disease, stroke, and lung "
            "cancer. Short-term spikes can trigger asthma attacks and worsen "
            "existing heart and lung conditions."
        ),
        "at_risk_groups": ["Children", "Elderly", "Pregnant women", "Asthma or heart conditions", "Outdoor workers"],
        "actions_by_severity": {
            "good": ["Safe for normal outdoor activity."],
            "moderate": ["Most people are fine outdoors; sensitive groups should watch for symptoms."],
            "high": ["Limit prolonged outdoor exertion, especially for sensitive groups."],
            "severe": ["Wear an N95 (not a cloth mask) outdoors.", "Avoid roadside exercise.", "Close windows."],
            "hazardous": ["Stay indoors with windows closed.", "Wear an N95 if you must go out.", "Avoid all outdoor exercise."],
        },
        "citations": [_WHO_CITATION, _EPA_CITATION],
    },
    "pm10": {
        "what_it_is": (
            "Coarser dust and particle matter up to 10 microns — irritates the "
            "airways and eyes before it can travel as deep as PM2.5."
        ),
        "local_sources": ["Unpaved roads and construction dust", "Harmattan dust", "Refuse burning"],
        "body_effects": (
            "Irritates the nose, throat, and airways; worsens asthma and "
            "bronchitis, and reduces lung function with repeated exposure."
        ),
        "at_risk_groups": ["Children", "Elderly", "Asthma or bronchitis", "Outdoor workers"],
        "actions_by_severity": {
            "good": ["Safe for normal outdoor activity."],
            "moderate": ["Most people are fine outdoors."],
            "high": ["Sensitive groups should reduce time outdoors in dusty areas."],
            "severe": ["Wear a mask in dusty conditions.", "Keep windows closed."],
            "hazardous": ["Stay indoors.", "Cover your nose and mouth if you must travel."],
        },
        "citations": [_WHO_CITATION, _EPA_CITATION],
    },
    "no2": {
        "what_it_is": (
            "A reactive gas produced by high-temperature combustion — mainly "
            "engines and generators."
        ),
        "local_sources": ["Traffic exhaust", "Diesel generators", "Idling vehicles in traffic"],
        "body_effects": (
            "Irritates the airways, worsens asthma symptoms, and is linked to "
            "reduced lung development in children with repeated exposure."
        ),
        "at_risk_groups": ["Children", "Asthma", "People living or working near busy roads"],
        "actions_by_severity": {
            "good": ["No precautions needed."],
            "moderate": ["Most people are unaffected."],
            "high": ["Avoid exercising directly next to heavy traffic."],
            "severe": ["Avoid roadside exercise.", "Keep windows closed near traffic during peak hours."],
            "hazardous": ["Avoid busy roads entirely.", "Stay indoors with windows closed."],
        },
        "citations": [_WHO_CITATION, _EPA_CITATION],
    },
    "o3": {
        "what_it_is": (
            "Ground-level ozone forms when sunlight reacts with traffic and "
            "industrial emissions — unlike the protective ozone layer above us, "
            "this ozone is a lung irritant."
        ),
        "local_sources": ["Traffic emissions reacting in strong sunlight", "Typically peaks in early-to-mid afternoon"],
        "body_effects": (
            "Irritates airways, reduces lung function, and can trigger asthma "
            "attacks — effects are worse with physical exertion and heat."
        ),
        "at_risk_groups": ["Children", "Asthma", "Outdoor workers", "Anyone exercising outdoors midday"],
        "actions_by_severity": {
            "good": ["Safe for normal outdoor activity."],
            "moderate": ["Most people are fine outdoors."],
            "high": ["Move strenuous outdoor exercise to morning or evening."],
            "severe": ["Avoid outdoor exertion during afternoon hours.", "Sensitive groups should stay indoors midday."],
            "hazardous": ["Avoid outdoor activity entirely until levels fall, especially in the afternoon."],
        },
        "citations": [_WHO_CITATION, _EPA_CITATION],
    },
    "so2": {
        "what_it_is": (
            "A sharp-smelling gas released by burning sulfur-containing fuel."
        ),
        "local_sources": ["Diesel generators", "Some industrial fuel combustion", "Vehicle exhaust"],
        "body_effects": (
            "Irritates the airways and can trigger sudden bronchoconstriction, "
            "particularly in people with asthma, even after brief exposure."
        ),
        "at_risk_groups": ["Asthma", "Children", "People near generators or industrial sites"],
        "actions_by_severity": {
            "good": ["No precautions needed."],
            "moderate": ["Most people are unaffected."],
            "high": ["Asthmatics should keep a reliever inhaler on hand."],
            "severe": ["Avoid standing near running generators.", "Keep windows closed nearby."],
            "hazardous": ["Move away from the source and stay indoors with windows closed."],
        },
        "citations": [_WHO_CITATION, _EPA_CITATION],
    },
    "co": {
        "what_it_is": (
            "An odorless gas from incomplete combustion — dangerous because it "
            "cannot be smelled or seen."
        ),
        "local_sources": ["Generators", "Charcoal stoves in closed rooms", "Vehicle exhaust in enclosed spaces"],
        "body_effects": (
            "Binds to hemoglobin in place of oxygen, reducing how much oxygen "
            "your blood can carry. Causes headache and dizziness at moderate "
            "levels; can be fatal in enclosed spaces at high levels."
        ),
        "at_risk_groups": ["Anyone near generators or charcoal stoves indoors", "Pregnant women", "Heart conditions"],
        "actions_by_severity": {
            "good": ["No precautions needed."],
            "moderate": ["No precautions needed."],
            "high": ["Never run a generator or charcoal stove indoors or in an enclosed space."],
            "severe": ["Ventilate any room with a generator or stove immediately.", "Move outdoors if you feel dizzy or have a headache."],
            "hazardous": ["Leave the area and get fresh air immediately.", "Seek medical help if symptoms persist."],
        },
        "citations": [_WHO_CITATION, _EPA_CITATION],
    },
}


def pct_of_who_limit(code: str, value: Optional[float]) -> Optional[float]:
    """Ratio to the WHO guideline, as a percentage. Never a share of a shared 100%."""
    if value is None:
        return None
    guideline = WHO_2021_GUIDELINES.get(code)
    if not guideline:
        return None
    return round((float(value) / guideline["limit"]) * 100.0, 1)


def severity_for_pct(pct: Optional[float]) -> str:
    """Severity tier for a % of the WHO limit — used for card color AND text/icon."""
    if pct is None:
        return "unknown"
    tier = SEVERITY_CUTOFFS[0][0]
    for name, cutoff in SEVERITY_CUTOFFS:
        if pct >= cutoff:
            tier = name
    return tier


def cigarette_equivalent(pm25_ug: Optional[float]) -> Optional[float]:
    """Berkeley Earth cigarette-equivalent for a PM2.5 reading, labeled as an approximation by the caller."""
    if pm25_ug is None:
        return None
    return round(float(pm25_ug) / CIGARETTE_EQUIVALENT_PM25_UG, 1)


def actions_for(code: str, severity: str) -> List[str]:
    info = POLLUTANT_INFO.get(code) or {}
    tiers = info.get("actions_by_severity") or {}
    return tiers.get(severity) or tiers.get("moderate") or []


# Health conditions that tighten how a reading is presented — a "Moderate" day
# reads as more urgent for someone who told us they have asthma. This shifts
# the AQI *category* shown to that user by one tier; it does not change the
# underlying pm2.5 number or the pollutant cards, which stay factual for
# everyone. Conditions list mirrors the onboarding health-profile options.
SENSITIZING_CONDITIONS = {
    "asthma",
    "heart_condition",
    "pregnancy",
    "elderly_household",
    "young_children",
    "outdoor_worker",
}

_AQI_TIER_ORDER = ["Good", "Moderate", "Unhealthy for Sensitive Groups", "Unhealthy", "Hazardous"]


def tightened_category(aqi_category: str, health_conditions: Optional[List[str]]) -> Optional[Dict[str, Any]]:
    """One tier worse than the plain category, if the profile has any
    sensitizing condition and there's a worse tier to move to."""
    if not health_conditions:
        return None
    if not any(c in SENSITIZING_CONDITIONS for c in health_conditions):
        return None
    try:
        idx = _AQI_TIER_ORDER.index(aqi_category)
    except ValueError:
        return None
    if idx >= len(_AQI_TIER_ORDER) - 1:
        return None
    return {
        "category": _AQI_TIER_ORDER[idx + 1],
        "reason": "Your health profile lowers the threshold for this warning.",
    }
