# Mframapa AI — Roadmap

Phased for the pitch, not a sprint plan — see `EXECUTION_PLAN.md`/`SPEC.md` for
the detailed internal build schedule. Each phase lists goals, features, and how
we'd know it worked. Anything not yet committed is marked as a placeholder for
the team to confirm, per `docs/business-model.md`'s same convention.

## Phase 1 — Now to 3 months: multi-pollutant, personalization, pilot

**Goal:** turn "here's a number" into "here's why it matters to you," and prove
it in two cities before expanding.

**Features:**
- Multi-pollutant home tab: PM2.5, PM10, NO2, O3, SO2, CO, each shown as %
  of the WHO 2021 guideline limit, sorted most-dangerous-first, tap-to-expand
  health detail with sources/effects/at-risk groups/actions — **shipped this
  update**.
- Data-driven, consequence-focused headline and insights (cigarette-equivalent
  framing, week-over-week comparison, worst-pollutant callout) — **shipped this
  update**.
- Sign-in (existing Supabase auth) + onboarding health profile (conditions,
  home/work location, routine) with personalized severity thresholds — **backend
  + onboarding flow shipped this update; see final report for what's stubbed**.
- Pilot in Kumasi and Accra: the two cities the demo/pitch data already centers
  on, expanding the existing four-site demo overrides into a real pilot
  footprint.

**Success metrics:** freemium request volume growth over the 46K+/30-day
baseline; sign-in conversion rate from anonymous home-tab users; qualitative
pilot feedback from Kumasi/Accra users on whether the new cards change behavior
(the reviewer's original test).

## Phase 2 — 3 to 6 months: forecasting, notifications, local languages

**Goal:** move from "check when you remember" to "get told before it matters."

**Features:**
- Forecast surfaced on the home tab (the `/forecast` endpoint already exists
  server-side; this is client-side surfacing + UX, not new data work).
- Push notification alerts tied to personal thresholds — this update ships the
  schema and registration plumbing (`push_tokens` gains `user_id` and
  `threshold_offset`); wiring the alert-delivery job to actually consult
  per-user thresholds is the Phase 2 work.
- Twi and other local-language support for the new pollutant-card and insight
  copy — this update ships English-first (the existing i18n system already
  covers 30+ languages for the rest of the app; the new strings need the same
  translation pass).
- SMS alerts for non-smartphone users, via the telco partnership track in
  `docs/business-model.md`.

**Success metrics:** push opt-in rate; alert-to-action correlation (does an
alert change whether someone checks the app or takes a precaution); language
coverage of the new copy.

## Phase 3 — 6 to 12 months: ground-sensor validation, B2G dashboard, expansion

**Goal:** back the satellite estimate with local ground truth, and turn
institutional interest into signed contracts.

**Features:**
- Low-cost ground sensor partnerships to validate satellite-derived readings
  against reference measurements — directly strengthens the "scientifically
  accurate" half of the reviewer's brief and the OpenAQ fallback path already
  in the data pipeline.
- B2G dashboard: the institutional API tier already exists technically
  (`backend/api/security.py` rate tiers); this phase is the dashboard product
  and the first signed municipal/regulator contracts.
- Expansion to other West African cities beyond Ghana, prioritized by where
  ground-sensor partnerships and B2G interest land first.

**Success metrics:** measured agreement (bias/RMSE) between satellite estimate
and ground sensors per pilot site; number of signed institutional/B2G
contracts; city coverage count.

## Phase 4 — 12 months and beyond: API product, exposure tracking, health outcomes

**Goal:** become infrastructure other health and civic products build on, not
just an app people open once a day.

**Features:**
- Public API product (developer layer) — self-serve keys, documentation, and
  billing on top of the existing rate-limit infrastructure.
- Personal exposure tracking over time — cumulative dose estimates from a
  user's saved locations and routine, building on the health-profile and
  prediction-history data already collected in Phase 1.
- Health-outcome partnerships — research collaborations connecting exposure
  data to health outcomes (asthma ER visits, birth outcomes, etc.), feeding the
  research/grant funding track in `docs/business-model.md`.

**Success metrics:** third-party API integrations live; opt-in rate for
exposure tracking among signed-in users; number of active research
partnerships.

---

**No invented traction numbers or partnerships appear above** — real figures
(freemium usage, NASA award, existing rate-limit infrastructure) are called out
where they're real; everything else is a goal or an assumption for the team to
confirm, consistent with `docs/business-model.md`.
