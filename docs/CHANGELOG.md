# Changelog

A running, breakdown-level log of changes made to this repo in this work
stream. Newest entries first. Each entry lists exactly what changed and in
which files — this is the log to check before asking "did we already do X."

---

## 2026-09-18 — Backend: ERA5 could hang a request thread for hours

**Why:** User pasted live server logs showing `Recovering from connection
error [...cds.climate.copernicus.eu...], attempt 1 of 500 / Retrying in 120
seconds` — this is `cdsapi.Client`'s own internal retry loop (default
`retry_max=500`, `sleep_max=120`), completely separate from and not bounded
by this codebase's own retry wrapper. `backend/utils/retry.py`'s `with_retry`
decorator enforces its `timeout` via `SIGALRM`, which **only works in the
main thread** (its own docstring says so) — but FastAPI runs sync endpoints
in worker threads, and the startup prewarm runs in a background thread, so
in every real code path the documented `timeout=180` on ERA5's
`_fetch_with_retry` was a no-op. A slow/degraded Copernicus CDS API could
therefore block a single `self.client.retrieve()` call for up to ~500×120s
(hours), starving that worker thread and never giving the
ERA5→OpenMeteo→NASA-POWER fallback chain a chance to run — which is very
likely why intermittent "Failed to fetch"/"could not locate city" errors
kept recurring even after the CORS port fix.

**Fix:** `backend/data_sources/era5.py` — `ERA5DataSource.__init__` now
constructs `cdsapi.Client(..., retry_max=1, timeout=30)` explicitly. cdsapi
gets exactly one attempt (bounded by a 30s HTTP read timeout) instead of up
to 500; this codebase's own `with_retry(max_attempts=3, backoff_factor=2)`
wrapping `_fetch_with_retry` remains the actual retry layer, so ERA5 now
fails in well under a minute instead of potentially hanging for hours.

**Verification:** New test `test_client_bounds_cdsapi_internal_retry` in
`backend/tests/test_era5.py` asserts the client is constructed with
`retry_max=1` and a `timeout` ≤ 60s — locks this in as a regression test.
318 backend tests pass (1 new).

**Not fixed (flagged, not silently skipped):** `with_retry`'s SIGALRM
limitation is broader than ERA5 — any other data source using it from a
worker/background thread has the same "documented timeout doesn't actually
apply" gap. Only ERA5 was fixed here (the one actually reported hanging);
a real fix for `with_retry` itself would need a thread/future-based timeout
(e.g. run the call in an executor and bound it with `future.result(timeout=)`,
which works regardless of the calling thread) rather than `signal.alarm`.

---

## 2026-09-18 — Mobile: fix "Do you have a screen named 'HealthRisk'?" nav warning

**Why:** `CityDetailScreen.tsx`'s "view health risk breakdown" link
(`navigation.navigate('HealthRisk', { prediction: pred })`) only worked when
`CityDetail` was opened from the Home tab. `HealthRisk` was registered only
in `HomeStack` and `ProfileStack` (`mobile/src/navigation/AppNavigator.tsx`),
but `CityDetail` itself is reachable from every tab (Home, Map, Search,
Profile all navigate to it — confirmed by grepping every `navigate('CityDetail'...)`
call site: `HomeScreen.tsx`, `MapScreen.tsx`, `SearchScreen.tsx`,
`SavedLocationsScreen.tsx`, `CountryExplorerScreen.tsx`). Opening a city via
Map or Search and tapping through to health risk hit exactly this dev
warning and silently failed to navigate.

**Fix:** `mobile/src/navigation/AppNavigator.tsx` — added
`<Stack.Screen name="HealthRisk" component={HealthRiskScreen} />` to
`MapStack` and `SearchStack`, matching the existing pattern of duplicating
`CityDetail` across every stack that can reach it.

**Verification:** `tsc --noEmit` clean (0 errors). Not something I could
trigger myself (no iOS simulator in this environment) — traced by grepping
every `CityDetail`/`HealthRisk` navigate call site against the stack
definitions rather than reproducing live.

---

## 2026-09-17 — PWA: hero card size matched to mobile exactly

**Why:** The "Air right now" hero card had drifted taller than mobile's —
someone had already done a careful pixel-matching pass on both cards
(padding, radius, font sizes, chevron position all identical), but the PWA
card still rendered the `HeroHeadline` component inside it (the "PM2.5 is
2.3x the WHO limit…" line from the original reviewer-feedback build), which
was never added to mobile's card.

**Fix:** `frontend-pwa/src/features/home/HomeScreen.jsx` — removed the
`<HeroHeadline pred={pred} colors={colors} />` line and its now-unused
import from inside the hero card button. Left `HeroHeadline.jsx` itself on
disk (unreferenced) rather than deleting it, since other pollutant-card
work is actively in progress in this codebase outside this session's direct
edits and the file may still be wanted elsewhere.

**Verification:** `npm run lint` (0 new errors — 2 pre-existing warnings
from other in-progress files, not this change) and `npm run build` both clean.

---

## 2026-09-17 — Mobile (iOS): ported multi-pollutant square cards from the PWA

**Why:** User feedback: any update made to one platform should be applied
across platforms. The pollutant-card redesign (below) had only shipped to
the PWA — mobile's Home screen still had no pollutant display at all
(`PredictionResult` didn't even carry `pollutants[]`).

**What shipped — full port, not just the visual:**
- `mobile/src/store/useStore.ts` — new `PollutantReading` type (mirrors
  `backend/config/pollutants.py`'s shape exactly) + `pollutants?: PollutantReading[]`
  on `PredictionResult`.
- `mobile/src/services/api.ts` — `mapPrediction()` now passes through
  `data.pollutants`; new `getPollutantInfo()` (session-cached, same pattern
  as `getDailyFact`).
- `mobile/src/theme/colors.ts` — `pollutantSeverityColor`/`pollutantSeveritySymbol`,
  reusing the existing checked `AQI_DARK`/`AQI_LIGHT` palette (mirrors
  `frontend-pwa/src/utils/colors.js` exactly).
- **New:** `mobile/src/components/PollutantCard.tsx` — square card, Ionicons
  icon per pollutant (`aperture-outline`/`cloudy-outline`/`car-outline`/
  `sunny-outline`/`flash-outline`/`flame-outline` for PM2.5/PM10/NO2/O3/SO2/CO
  — mapped to the nearest Ionicons glyph so mobile stays on one icon family,
  unlike the PWA's lucide icons), a native `BatteryMeter` (View-based vertical
  fill, same fill-height-and-colour-encode-danger logic as the PWA's SVG version).
- **New:** `mobile/src/components/PollutantCardGrid.tsx` — 3-column flex-wrap
  grid (RN has no CSS Grid; `width: '31.5%'` + `aspectRatio: 1` per card).
- **New:** `mobile/src/components/PollutantDetailSheet.tsx` — tap-to-expand
  detail using the existing `GlassSheet` bottom-sheet component: what it is,
  local sources, body effects, at-risk groups, actions for the current
  severity, citations. **Not ported:** the PWA's 7-day sparkline — it needs a
  per-point history fetch that isn't wired up on mobile yet; flagged as a
  follow-up rather than silently dropped.
- `mobile/src/screens/HomeScreen.tsx` — grid inserted between the hero card
  and "What to do" (same placement as the PWA); tapping a card opens the
  detail sheet.
- `mobile/src/locales/en.ts` — added the same `pollutant.*` keys as the PWA's `en.json`.

**Verification:** `tsc --noEmit` clean (0 errors) — caught and fixed two real
type errors during this port: (1) `colors` prop typed as `AppColors`
(`typeof darkColors` specifically) rejected the light-theme variant returned
by `getColors(false)` — fixed by matching the codebase's existing
`ReturnType<typeof getColors>` convention (used elsewhere, e.g. `AQICard.tsx`);
(2) indexing a plain object literal with a `string`-widened key produced
`string | undefined` — fixed by giving the severity→band map an explicit
literal union return type, matching how `aqiBand()` already does it in the
same file. No iOS simulator available in this environment to visually confirm.

---

## 2026-09-17 — PWA: pollutant cards redesigned as a battery-style grid

**Why:** The initial pollutant cards were a horizontally-scrolling row with a
thin horizontal progress bar. Feedback: they should be square cards with an
icon each, laid out in the grid between the prediction card and "What to
do" (placement was already correct), and the percentage should read as a
vertical battery-style fill (colour + fill height both encoding danger).

**Fix:**
- `frontend-pwa/src/features/home/components/PollutantCard.jsx` — rebuilt as
  a square (`aspect-square`) card: pollutant icon in a tinted badge (`Wind`
  for PM2.5, `CloudFog` for PM10, `Car` for NO2, `Sun` for O3, `Factory` for
  SO2, `Flame` for CO — each tied to the pollutant's real-world source, not
  decorative), a new `BatteryMeter` sub-component (vertical fill, rounded
  cap, fills bottom-up, coloured by severity), the `%` number, short name,
  and severity label. Still colour + icon + text together, never colour alone.
- `frontend-pwa/src/features/home/components/PollutantCardGrid.jsx` —
  switched from a horizontal-scroll row to a 3-column CSS grid
  (`grid-cols-3`), so the 6 cards render as a proper square grid instead of
  a scroller.

**Verification:** `npm run lint` and `npm run build` both clean (0 new errors/warnings).

---

## 2026-09-17 — Mobile: remove mandatory sign-in on launch (iOS)

**Why:** Opening the iOS app forced users through a Login screen before
reaching `MainApp` — even "Continue without account" only worked by faking
`isAuthenticated: true`. The app must be usable as a guest by default;
sign-in should only be reachable from Profile, for personalization.

**Root cause:** `AppNavigator.tsx` gated the entire app on
`store.isAuthenticated`, and onboarding had a 4th `'auth'` phase that always
landed on Login. Guest use was implemented as a fake authenticated state
rather than "app usable, not signed in."

**Fix — separated "completed onboarding" from "signed in":**
- `mobile/src/store/useStore.ts`
  - Added `hasCompletedOnboarding: boolean` (persisted) + `completeOnboarding()`.
  - Removed `enterAsGuest()` — guest is now the default, not a state you enter.
  - `signOut()` no longer calls `markSignOutThisSession()` (see below);
    signing out just flips `isAuthenticated: false` and stays in `MainApp`
    as a guest, instead of being kicked back into onboarding.
  - Persist `version` bumped 7 → 8 with a migration: existing installs get
    `hasCompletedOnboarding` backfilled from their old `isAuthenticated` (so
    nobody already using the app is sent back through onboarding), and the
    old guest-fake-auth signature (`isAuthenticated: true` with no
    `profile.email`) is corrected back to `false`.
- `mobile/src/navigation/AppNavigator.tsx`
  - Root `AppNavigator` now gates on `hasCompletedOnboarding`, not `isAuthenticated`.
  - `OnboardingNavigator` is back to 3 phases (`splash` → `slides` →
    `permissions`), ending directly in `MainApp` — no `'auth'` phase.
  - Removed the now-dead `AuthFlow` component.
- `mobile/App.tsx`
  - `NavigationContainer`'s remount `key` and the push-notification-prompt
    timer now key off `hasCompletedOnboarding` instead of `isAuthenticated`.
- `mobile/src/screens/onboarding/LoginScreen.tsx`
  - Removed the "Continue without account" button/handler — redundant now
    that Login is only reachable from Profile, where the user is already in
    the app as a guest. Removed the now-unused `onAuth` prop.
- `mobile/src/screens/ProfileScreen.tsx`
  - Updated a stale comment; no logic change — it already derived
    `hasAccount` from `profile.email`, not `isAuthenticated`, so it needed
    no fix.
- `mobile/src/session/authSession.ts` — **deleted** (dead code once the
  sign-out → onboarding-auth-skip logic was removed).

**Verification:** `tsc --noEmit` clean (0 errors). No mobile test suite
exists to run. Could not launch iOS simulator/device from this environment —
needs confirming on-device that launch now goes straight to Home.

---

## 2026-09-17 — PWA: remove personalization step from onboarding

**Why:** The reviewer-feedback build (below) had added a 4th onboarding
screen collecting health-profile data before first app use. User feedback:
sign-in/sign-up must not be part of opening the app — the app is usable as a
guest, and personalization (which needs sign-in) belongs in Profile only.

**Fix:**
- `frontend-pwa/src/features/onboarding/OnboardingScreen.jsx` — removed the
  `HealthProfilePhase` step and its imports (`HealthProfileForm`,
  `getColors`). Onboarding is back to 3 phases (splash → slides →
  permissions), completing directly with no personalization prompt.
- The standalone Health Profile screen (`frontend-pwa/src/features/healthProfile/HealthProfileScreen.jsx`)
  is untouched and still reachable — only from Profile → Health profile.

**Verification:** `npm run lint` and `npm run build` both clean (0 new errors/warnings).

---

## 2026-09-17 — Backend + PWA: reviewer feedback implementation (todo.md)

Implements the reviewer-feedback brief (`todo.md`): multi-pollutant data,
home tab redesign, data-driven insights, personalization, and business docs.
Scope: backend + PWA (mobile parity and the pitch-deck slide are follow-ups).
Full detail in `docs/reviewer-feedback-implementation-report.md` — summary
below.

### Workstream 1 — Multi-pollutant data
- **New:** `backend/config/pollutants.py` — WHO 2021 limits, severity
  cutoffs, cigarette-equivalent constant, per-pollutant health copy +
  citations, sensitizing-condition logic.
- **New:** `backend/pipeline/pollutant_display.py` — builds the sorted
  `pollutants[]` array with last-known-value fallback + `stale`/`updated_at`.
- **Changed:** `backend/data_sources/orchestrator.py` — added
  `no2_surface`/`so2_surface`/`co_surface`/`o3_surface` as dedicated
  Open-Meteo CAMS output features (distinct from the Sentinel-5P
  column-density ML features).
- **Changed:** `backend/api/v1/router.py` — `/predict` and `/batch-predict`
  return `pollutants[]`; new `GET /api/v1/pollutant-info` route.
- **New tests:** `backend/tests/test_pollutants_config.py`, additions to
  `backend/tests/test_api.py`.

### Workstream 2 — Home tab redesign
- **New:** `frontend-pwa/src/features/home/components/{HeroHeadline,PollutantCard,PollutantCardGrid,PollutantDetailSheet,InsightsSection}.jsx`
- **Changed:** `frontend-pwa/src/features/home/HomeScreen.jsx` — now a
  composition root over the above.
- **Changed:** `frontend-pwa/src/utils/colors.js` — added
  `pollutantSeverityColor`/`pollutantSeveritySymbol`, reusing the existing
  WCAG-checked AQI palette.

### Workstream — Insights rewrite
- **Changed:** `backend/api/v1/router.py` — added `_weekly_comparison()` /
  `_fill_weekly_comparison_cache()`: a `comparison` field on `/predict`
  (week-over-week % change), computed in a **background thread** with
  per-cell caching. (Originally computed synchronously; caught during
  testing that this would have multiplied `/predict` latency ~8x against
  live satellite APIs — fixed before shipping.)
- Kept `backend/api/insights.py`'s translation-safe line bank untouched;
  the new comparative/worst-pollutant sentence is assembled client-side in
  `InsightsSection.jsx` from real numbers, not routed through translation.

### Workstream 3 — Personalization
- **New:** `backend/api/profile_store.py` + `GET/PUT/DELETE /api/v1/health-profile`
  (backed by new Supabase table, SQL in `docs/db/health_profiles.sql` — run manually).
- **Changed:** `backend/api/v1/router.py` — `/predict` returns a
  `personalized` block (one AQI tier worse) for signed-in users with a
  sensitizing health condition.
- **New:** `frontend-pwa/src/features/healthProfile/{healthConditions.js,HealthProfileForm.jsx,HealthProfileScreen.jsx}`
  — reachable from Profile → Health profile (edit/delete, privacy note).
  *(Note: the onboarding-step version of this was reverted — see the entry above.)*
- **New:** `backend/api/saved_locations_store.py` + `GET/POST/DELETE /api/v1/saved-locations`
  (new Supabase table, SQL in `docs/db/saved_locations.sql` — run manually).
  Syncs the PWA's already-working local saved-locations feature to a signed-in account.
- **Changed:** `backend/alerts/storage.py` — `push_tokens` gained `user_id`/`threshold_offset`
  columns + a migration guard. **Stubbed on purpose:** `backend/alerts/episode_detector.py`
  does not yet consult the threshold when deciding whether to send an alert.
- **New tests:** `backend/tests/test_health_profile.py`,
  `backend/tests/test_saved_locations_and_push_threshold.py`.

### Workstream 4 — Business docs
- **New:** `docs/business-model.md`, `docs/roadmap.md` — extend (not
  duplicate) the existing `docs/pitch/BUSINESS_MODEL.md`. Real numbers
  marked real; pricing/contract bands marked as benchmarks.

**Verification:** 306 backend tests pass (57 new). Frontend build + lint
clean (0 new errors/warnings). Backend endpoints verified live via curl
(correct `pollutants[]` shape/sorting/severity) through both the raw
backend and the Vite dev proxy. No visual/interactive browser check was
possible this session (no Chrome extension connected, no Playwright
available) — flagged in the final report.

**Manual steps still needed:**
- Run `docs/db/health_profiles.sql` and `docs/db/saved_locations.sql` in the Supabase SQL editor.
- Confirm the `hazardous` severity cutoff (600% of WHO limit) — placeholder, brief didn't specify one.
- Translate new insight/pollutant copy into the 29 non-English locales (ships English-only for now).
