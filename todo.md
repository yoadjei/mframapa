# MFRAMAPA AI: FEEDBACK IMPLEMENTATION BRIEF

## Context
Mframapa AI is an air quality app for Ghanaian/African users. It currently centers on satellite-derived PM2.5 monitoring. We received feedback from a reviewer and must implement all of it. The core criticism: the app tells people the air quality but gives them no reason to care. The goal of this update is to make the danger feel real, personal, and actionable, so users feel they NEED the app to protect themselves.

Guiding principle for every decision: LET THE PROBLEM BE SCARY, but stay scientifically accurate. Scary through real numbers and real health consequences, never through made-up or exaggerated data.

## Step 0: Before writing any code
1. Read the entire repository. Identify the frontend framework, backend, data sources, current API integrations, auth setup (if any), state management, and styling system.
2. Write a short summary of the current architecture and how PM2.5 data flows from source to the home screen.
3. List every file you plan to change or create. Do not introduce a new framework or major library unless the existing stack genuinely cannot do the job. If you add one, justify it.
4. Do not break the existing deployment. All changes must build and run cleanly.

## Workstream 1: Multi-pollutant data (foundation for everything else)
The app must go beyond PM2.5. Track at minimum:
- PM2.5
- PM10
- NO2 (nitrogen dioxide)
- O3 (ground-level ozone)
- SO2 (sulfur dioxide)
- CO (carbon monoxide)

Requirements:
- Keep the existing satellite PM2.5 pipeline. Supplement the other pollutants from a reliable source (e.g. Open-Meteo Air Quality API, OpenAQ, or whatever is already integrated). Pick one, document why, and handle API failures gracefully with a cached last-known value and a visible "last updated" timestamp.
- For each pollutant, compute: current concentration, unit, WHO 2021 guideline limit, and ratio to that limit expressed as a percentage.
- Put all thresholds and health text in ONE config/constants file so values can be updated without touching UI code. Cite the source (WHO 2021 Air Quality Guidelines) in a comment.
- NEVER present pollutant concentrations as shares of a combined 100% pie. They are different units with different toxicity. The "percentage" shown to users is always "% of WHO safe limit."

## Workstream 2: Home tab redesign (feedback items 3, 4, 6, 7, 8)
The home tab is the most important screen. When a user opens it, within 3 seconds they should know: how bad the air is, which pollutants are the problem, what it does to their body, and what to do right now.

### 2a. Hero section
- Big overall AQI number and status (Good / Moderate / Unhealthy for Sensitive Groups / Unhealthy / Very Unhealthy / Hazardous) using the standard AQI color scale.
- One plain-language, consequence-driven headline tied to the actual data. Examples of the tone (generate dynamically from real values, do not hardcode):
  - "PM2.5 is 4x the safe limit right now. Breathing this air today is like smoking about X cigarettes." (Use the Berkeley Earth approximation: ~22 µg/m³ PM2.5 over 24h ≈ 1 cigarette. Label it as an approximation.)
  - "Air in your area is currently safe. Good day to be outside."
- No vague lines like "air quality is moderate, take care." That is exactly what the reviewer called too vague.

### 2b. Pollutant cards (the key feature)
A grid/row of cards on the home tab, one per pollutant. Each card shows:
- Pollutant name (short name + plain name, e.g. "NO2 · Nitrogen dioxide")
- Current value and unit
- % of WHO safe limit, as a large number
- A visual bar or gauge filling toward/past the limit line
- Card color by severity:
  - Green: under 100% of limit
  - Yellow: 100 to 200%
  - Orange: 200 to 350%
  - Red: over 350%
  - Deep purple/maroon: hazardous tier
  (Put these cutoffs in the config file so they can be tuned.)
- Sort cards so the most dangerous pollutant appears first.
- Colors must pass accessibility contrast and severity must also be communicated by text/icon, not color alone.

### 2c. Tap-to-expand detail (makes it scary AND useful)
Tapping a card opens a detail view with:
- What it is, in one sentence
- Where it comes from locally (e.g. PM2.5: vehicle exhaust, burning refuse, charcoal cooking, Harmattan dust; NO2: traffic and generators; CO: generators, charcoal stoves in closed rooms)
- What it does to the body at current levels, specific not generic (e.g. "PM2.5 particles are small enough to enter your bloodstream through your lungs. Long-term exposure is linked to heart disease, stroke, and lung cancer.")
- Who is most at risk (children, elderly, pregnant women, people with asthma or heart conditions)
- Concrete actions for the current level (wear an N95 not a cloth mask, close windows, avoid roadside exercise, don't run a generator or charcoal stove indoors, etc.)
- Short trend chart for the last 24h / 7 days if data is available

All health claims must come from WHO, EPA, or equivalent sources. Keep a sources list in the codebase. No invented statistics.

### 2d. Insights section rewrite (item 3)
Replace every generic insight with ones that are:
- Specific to the user's location and current data
- Comparative ("Today is 60% worse than this week's average")
- Time-aware ("Levels usually peak around 7 to 9am on this road; plan outdoor activity after 11am" only if the data supports it)
- Actionable (each insight ends with something the user can do)

## Workstream 3: Sign-in and personalization (item 2)
- Add authentication. If the project already uses a provider (Firebase, Supabase, Clerk, etc.), use that. Otherwise pick the simplest one that fits the stack. Support Google sign-in plus email at minimum.
- Allow guest use of the basic home tab, but make the personalized experience the obvious reason to sign in.
- Onboarding after sign-up (short, skippable, max 4 screens):
  - Home and work/school locations
  - Health profile (optional): asthma, heart condition, pregnancy, elderly in household, young children, outdoor worker (e.g. trader, okada rider, construction)
  - Daily routine: commute time, outdoor exercise habits
- Personalization effects:
  - Severity thresholds tighten for sensitive users (a "Moderate" day becomes a red warning for an asthmatic)
  - Headline and insights reference their profile ("You have asthma. NO2 is high near your workplace today. Keep your inhaler with you.")
  - Saved locations with quick switching
  - Push/notification alerts when their locations cross their personal threshold (if notifications are feasible in the current stack; if not, stub the setting and note it)
- Store health profile data securely, treat it as sensitive, allow users to edit and delete it. Add a short privacy note in onboarding.

## Workstream 4: Business model and roadmap (item 1)
Create `docs/business-model.md` and `docs/roadmap.md`. These are pitch materials, so write them clean and concise.

business-model.md should cover:
- Problem and target users (urban Ghanaians, parents, people with respiratory conditions, outdoor workers)
- Freemium: free core AQI + pollutant cards; premium for personalized alerts, family profiles, forecasts, route/exposure planning
- B2B/B2G: data dashboards and APIs for municipal assemblies, EPA Ghana, schools, hospitals, insurers, logistics companies
- Partnerships: health NGOs, telcos (SMS alerts for non-smartphone users), mask/air-purifier sellers (affiliate)
- Research/grant funding track
- Revenue streams, pricing assumptions (clearly marked as assumptions), key costs, and unfair advantage (satellite-based coverage where ground sensors don't exist)

roadmap.md should be phased:
- Phase 1 (now to 3 months): this update, multi-pollutant cards, auth, personalization, pilot in Kumasi and Accra
- Phase 2 (3 to 6 months): forecasting, notifications, Twi and other local language support, SMS alerts
- Phase 3 (6 to 12 months): low-cost ground sensor partnerships to validate satellite data, B2G dashboard, expansion to other West African cities
- Phase 4 (12 months+): API product, exposure tracking over time, health outcome partnerships
Each phase: goals, features, success metrics.

Mark anything uncertain as a placeholder for the team to confirm. Do not invent traction numbers, user counts, or partnerships.

## Workstream 5: Pitch deck demo slide (items 9, 10)
Update the demo slide(s) in the pitch deck:
- The app demo (screen recording or phone mockup) must take up the majority of the slide, at least 60 to 70% of the slide area. Cut text to a minimum.
- The demo must show the actual user flow, in this order:
  1. Opening the app, hero AQI + scary headline
  2. Pollutant cards with a red card at the top
  3. Tapping a red card, health impact + actions
  4. Signing in and setting a health profile
  5. Home tab changing to reflect the personal risk
- If it's a static slide, use 3 to 5 large sequential screenshots with numbered short captions (max 6 words each). If video is possible, record a 30 to 45 second flow with those same beats.
- Use real app screens from the new build, not old screenshots.

## Definition of done
- [ ] All 6 pollutants shown on home tab with % of WHO limit and severity colors
- [ ] Cards sorted by danger, tappable, with specific health effects and actions
- [ ] Generic insights fully replaced with specific, actionable ones
- [ ] Headline is data-driven and consequence-focused
- [ ] Auth works, onboarding collects location + health profile, and the home tab visibly changes based on it
- [ ] All thresholds and health copy live in a single config file with sources
- [ ] business-model.md and roadmap.md written
- [ ] Demo slide updated with a large, flow-based demo
- [ ] App builds, no console errors, existing features still work, mobile layout tested
- [ ] Final report listing: what changed, files touched, data sources used, anything stubbed or needing team decisions

## Rules
- Plain, direct language in all user-facing copy. No jargon without a one-line explanation.
- Scary is fine. False is not. Every number and health claim must be traceable to real data or a cited source.
- Mobile-first. Most users will be on Android phones on patchy connections, so keep payloads light and handle offline states.
- Ask before deleting existing features or making irreversible data/schema changes.