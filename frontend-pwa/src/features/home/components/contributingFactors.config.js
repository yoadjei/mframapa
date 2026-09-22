/**
 * "What's in your air" home-screen cards — which factors show, in what
 * priority order, and the pct-of-WHO-limit breakpoints that drive the
 * battery fill colour + status word.
 *
 * PM2.5 is deliberately NOT one of these four — it's already the hero
 * reading (the big number + headline above this section), so repeating it
 * here would be redundant. These four cards exist to surface the other
 * harmful pollutants that would otherwise get no visibility at all.
 *
 * WHO 2021 24-hour (8-hour for O3) guideline values themselves live in
 * backend/config/pollutants.py (single source of truth) and arrive on each
 * pollutants[] entry as who_limit/pct_of_limit — this file only picks which
 * of those entries to show here and how to colour them:
 *   NO2: 25 µg/m³ | O3: 100 µg/m³ (8-hour) | SO2: 40 µg/m³ | CO: 4000 µg/m³
 *   https://www.who.int/publications/i/item/9789240034228
 *
 * This is a deliberately separate, simpler scale from the backend's 5-tier
 * severity system (good/moderate/high/severe/hazardous at 100/200/350/600%)
 * used by the pollutant detail sheet — these cards use the product brief's
 * own 4-tier scale below instead, by design (confirmed with the team rather
 * than folded into the existing severity tiers).
 */

// Priority order: drop from the end when a factor's data is unavailable,
// never reorder the remaining ones.
export const FACTOR_ORDER = ["no2", "o3", "so2", "co"];
export const MAX_FACTOR_CARDS = 4;

// % of WHO limit. Fill colour is interpolated smoothly between the anchor
// colours at these breakpoints (see factorFillColor in utils/colors.js);
// the same breakpoints define the status word shown below the number.
export const FACTOR_FILL_BREAKPOINTS = [0, 50, 100, 200];

export const FACTOR_TINY_LABEL_KEY = {
  no2: "factor.tiny.no2",
  o3: "factor.tiny.o3",
  so2: "factor.tiny.so2",
  co: "factor.tiny.co",
};
