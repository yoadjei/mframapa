# Reviewer Feedback Implementation — Final Report

Implements `todo.md` (the reviewer feedback brief). Scope: **backend + PWA**
(mobile and the pitch-deck demo slide are follow-ups, per an earlier scoping
decision). All changes are additive to `/api/v1/predict`'s response shape, so
nothing existing — including the mobile app, which still reads the old
fields — breaks. 306 backend tests pass (57 new), frontend builds and lints
clean (0 new errors/warnings).

## Workstream 1 — Multi-pollutant data

- `backend/config/pollutants.py` (new) — single source of truth: WHO 2021
  limits, severity cutoffs (green/yellow/orange/red/hazardous), the Berkeley
  Earth cigarette-equivalent constant, per-pollutant health copy with
  citations, and the sensitizing-condition → tightened-category logic.
- `backend/data_sources/orchestrator.py` — added `no2_surface` /
  `so2_surface` / `co_surface` / `o3_surface` as dedicated output features,
  sourced only from Open-Meteo CAMS (never the Sentinel-5P column-density
  values used for ML inputs — different physical units, not WHO-comparable).
- `backend/pipeline/pollutant_display.py` (new) — builds the sorted
  `pollutants[]` array, with a last-known-value cache and `stale` /
  `updated_at` fields for graceful degradation on a CAMS outage.
- `/api/v1/predict` and `/api/v1/batch-predict` now return `pollutants[]` (6
  entries, worst-first). New `GET /api/v1/pollutant-info` serves the static
  health copy separately, so it isn't re-sent on every prediction.

## Workstream 2 — Home tab redesign

- `HomeScreen.jsx` split into `HeroHeadline`, `PollutantCardGrid` /
  `PollutantCard`, `PollutantDetailSheet` (with a 7-day PM2.5 sparkline — the
  only pollutant with real history data; the other five don't get a
  fabricated trend), and `InsightsSection`.
- Headline is now data-driven ("PM2.5 is 2.3x the WHO limit… like smoking
  ~1.6 cigarettes today") computed from real values, never hardcoded.
- `colors.js` gained pollutant-severity color/symbol helpers that reuse the
  existing WCAG-checked AQI palette rather than inventing a second one.

## Workstream — Insights rewrite

- Kept the existing translation-safe line bank (a deliberate design for
  50+-language safety) untouched, and added a second, numbers-driven
  sentence alongside it: week-over-week comparison + worst-pollutant
  callout, computed from a new `comparison` field on `/predict`.
- **Caught during testing:** the 7-day comparison was initially computed
  synchronously, which would have multiplied `/predict` latency by roughly
  8x against the live satellite APIs. Fixed by computing it in a background
  thread with per-cell caching — the first request gets `comparison: null`,
  the next one in the 6h window gets it from cache.

## Workstream 3 — Personalization

- New `backend/api/profile_store.py` + `GET/PUT/DELETE /api/v1/health-profile`,
  backed by a new Supabase `health_profiles` table (SQL in
  `docs/db/health_profiles.sql` — **needs to be run once in the Supabase
  dashboard**; not something I can apply from here).
- `/predict` now returns a `personalized` block (one AQI tier worse) for
  signed-in users with a sensitizing condition (asthma, heart condition,
  pregnancy, etc.).
- Onboarding gained a 4th, skippable "Health profile" screen; the Profile
  menu gained a "Health profile" entry (edit/delete, privacy note). Works
  for guests too (stored locally) and reconciles with the server on sign-in.
- Saved locations (already fully working client-side) now sync to a
  signed-in account — new `saved_locations` table
  (`docs/db/saved_locations.sql`, also needs to be run manually) + routes.
- Push alerts: `push_tokens` gained `user_id` / `threshold_offset` columns,
  and registration now carries them. **Explicitly stubbed, per the brief's
  own allowance:** `backend/alerts/episode_detector.py` doesn't yet consult
  the threshold when deciding whether to send an alert — this is schema and
  plumbing only.

## Workstream 4 — Business docs

- `docs/business-model.md` and `docs/roadmap.md` — written to extend the
  existing `docs/pitch/BUSINESS_MODEL.md`, not duplicate it. Real numbers
  (46K+ requests, NASA award, existing rate-limit tiers) are marked real;
  pricing/contract bands are marked as benchmarks; no invented traction.

## Data source for the 5 supplementary pollutants

Open-Meteo Air Quality API (CAMS) — already integrated, free, no auth
required, and reports surface concentrations in µg/m³ that are directly
comparable to WHO guidelines (unlike the Sentinel-5P satellite features used
for ML training). PM2.5 keeps the existing satellite ensemble.

## Files touched

**Backend — new:**
- `backend/config/pollutants.py`
- `backend/pipeline/pollutant_display.py`
- `backend/api/profile_store.py`
- `backend/api/saved_locations_store.py`
- `backend/tests/test_pollutants_config.py`
- `backend/tests/test_health_profile.py`
- `backend/tests/test_saved_locations_and_push_threshold.py`
- `docs/db/health_profiles.sql`
- `docs/db/saved_locations.sql`

**Backend — modified:**
- `backend/api/v1/router.py`
- `backend/data_sources/orchestrator.py`
- `backend/alerts/storage.py`
- `backend/tests/test_api.py`

**Frontend — new:**
- `frontend-pwa/src/features/home/components/HeroHeadline.jsx`
- `frontend-pwa/src/features/home/components/PollutantCard.jsx`
- `frontend-pwa/src/features/home/components/PollutantCardGrid.jsx`
- `frontend-pwa/src/features/home/components/PollutantDetailSheet.jsx`
- `frontend-pwa/src/features/home/components/InsightsSection.jsx`
- `frontend-pwa/src/features/healthProfile/healthConditions.js`
- `frontend-pwa/src/features/healthProfile/HealthProfileForm.jsx`
- `frontend-pwa/src/features/healthProfile/HealthProfileScreen.jsx`

**Frontend — modified:**
- `frontend-pwa/src/features/home/HomeScreen.jsx`
- `frontend-pwa/src/features/onboarding/OnboardingScreen.jsx`
- `frontend-pwa/src/features/profile/ProfileScreen.jsx`
- `frontend-pwa/src/features/auth/AuthScreen.jsx`
- `frontend-pwa/src/features/cityDetail/CityDetailScreen.jsx`
- `frontend-pwa/src/features/savedLocations/SavedLocationsScreen.jsx`
- `frontend-pwa/src/components/pwa/NotificationPermissionSheet.jsx`
- `frontend-pwa/src/app/App.jsx`
- `frontend-pwa/src/state/appState.jsx`
- `frontend-pwa/src/services/api.js`
- `frontend-pwa/src/services/predictionService.js`
- `frontend-pwa/src/services/webPush.js`
- `frontend-pwa/src/utils/colors.js`
- `frontend-pwa/src/locales/en.json`

**Docs — new:**
- `docs/business-model.md`
- `docs/roadmap.md`

## Things that need a decision or a manual step

- Run `docs/db/health_profiles.sql` and `docs/db/saved_locations.sql` in the
  Supabase SQL editor.
- Confirm the `hazardous` severity cutoff (600% of the WHO limit) — flagged
  as a placeholder in `pollutants.py` since the brief didn't specify one.
- New insight/pollutant copy ships English-only; the other 29 locales need a
  translation pass through the existing i18n pipeline.
- No visual screenshot/click-through was possible this session — no Chrome
  extension connected and no Playwright available in this environment.
  Correctness was verified by curling the backend directly (confirmed
  correct `pollutants[]` shape, sorting, and severity), through the Vite dev
  proxy, and via a clean build and lint. A visual pass is worth doing before
  shipping.
- Workstream 5 (pitch deck demo slide) and mobile parity are still open, per
  the earlier scoping decision.

## Definition of done — status

- [x] All 6 pollutants shown on home tab with % of WHO limit and severity colors
- [x] Cards sorted by danger, tappable, with specific health effects and actions
- [x] Generic insights extended with specific, actionable, data-driven lines (mood line kept, not replaced)
- [x] Headline is data-driven and consequence-focused
- [x] Auth works (pre-existing); onboarding collects location + health profile; home tab reflects personalization
- [x] All thresholds and health copy live in a single config file with sources
- [x] `business-model.md` and `roadmap.md` written
- [ ] Demo slide updated with a large, flow-based demo — deferred (needs the PWA UI to screenshot; browser tooling unavailable this session)
- [x] App builds, no console errors (lint/build clean); mobile layout — deferred, out of this pass's scope
- [x] Final report listing what changed, files touched, data sources, and what's stubbed/needs a decision
