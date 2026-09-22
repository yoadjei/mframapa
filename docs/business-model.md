# Mframapa AI — Business Model

Pitch-ready summary. Real numbers are labeled real; everything else is a clearly
flagged assumption for the team to confirm before it goes in front of investors.
This document restates and extends `docs/pitch/BUSINESS_MODEL.md` (the existing
tier/pricing analysis) around the reviewer's ask for a clean problem → model →
revenue narrative — it doesn't replace that file's detail on API rate limits and
comparable pricing.

## Problem

Africa has the world's worst air-quality-to-ground-sensor ratio — most cities
have no reference-grade monitor at all, so residents have no way to know what
they're breathing, let alone why it matters. The people most exposed — traders,
okada riders, construction workers, families near roads or generators — are also
the least likely to have access to a monitoring station. Meanwhile the health
cost is not hypothetical: WHO attributes millions of premature deaths a year
globally to air pollution, disproportionately in exactly the regions with the
least monitoring coverage.

Telling someone "air quality is moderate" doesn't change behavior. Telling them
their PM2.5 is 4x the WHO limit and today's exposure is like smoking two
cigarettes does. That reframe — numbers people can act on, not just a color — is
the product bet this document is built around.

## Target users

- **Urban Ghanaians and, over time, other West African city residents** — the
  freemium base; anyone deciding whether to go outside, open a window, or run a
  generator indoors.
- **Parents and caregivers** — decisions about children's outdoor play and school
  activity days.
- **People with respiratory or cardiac conditions** — asthma, COPD, heart
  disease; the personalization layer (health profile, tightened thresholds) is
  built specifically for this group.
- **Outdoor workers** — traders, okada/commercial drivers, construction and
  mining labor, who cannot simply "stay inside" and need actionable timing
  guidance instead.
- **Institutions** — schools, clinics, employers, and developers who need the
  same estimates at higher volume or embedded in their own systems.
- **Government, regulators, and NGOs** — city- and region-level dashboards where
  ground sensors don't reach.

## Revenue model

### Freemium (individuals) — adoption, not revenue

Free, forever, no signup required for the core AQI reading and (as of this
update) the full multi-pollutant breakdown. Signing in unlocks personalization —
health profile, saved locations, tightened alert thresholds — which is the
product's strongest reason to create an account, not a paywall. This tier's job
is adoption, trust, and the usage data that makes the paid tiers credible.

**Real, current traction** (see `docs/pitch/BUSINESS_MODEL.md` for detail):
- 46,000+ requests in the last 30 days
- Live usage in 5 countries: Ghana, US, France, Netherlands, Canada
- "Best Use of Data" — NASA International Space Apps Challenge, 2025

### Institutional / API — recurring subscription revenue

Paid API keys at a higher rate limit than the free tier — already built and
enforced today, not a roadmap item (`backend/api/security.py`: public keys 10
req/min, institutional keys 6,000 req/min). Target buyers: schools (attendance
and activity-day decisions), clinics (patient advisories), employers (outdoor
labor safety calls), and developers building on top of Mframapa data.

*Pricing is a benchmark, not yet set* — see `docs/pitch/BUSINESS_MODEL.md` for
IQAir/OpenWeather comparables and the suggested Africa (~$20–$100/mo) vs.
international (~$60–$300/mo) starting bands.

### Government & NGO (B2G) — contract revenue

Direct, non-self-serve contracts for city- or region-level dashboards and data
feeds: municipal assemblies, EPA Ghana and equivalent regulators elsewhere,
public health ministries, and NGOs running exposure or health programs.
Illustrative bands (not signed deals): Africa ~$3K–$8K/yr, international
~$10K–$25K/yr, using the same ability-to-pay logic as the institutional tier.

### B2B beyond the API tier

Data dashboards and exposure-reporting tools for organizations that need air
quality as an input to their own operations rather than an app: insurers
(underwriting/health-risk data), logistics and delivery companies (route/driver
exposure planning), hospitals (admissions correlation, patient advisories at
scale). Not yet productized — flagged as a Phase 2/3 track, not a current
revenue line.

### Research / grant funding track

Africa-specific satellite air-quality estimation is itself a research
contribution — the model fills a ground-sensor gap that published market
figures don't yet separately quantify for the continent. This supports grant
and research-partnership funding (climate/health foundations, university
collaborations) as a track alongside commercial revenue, particularly for the
ground-sensor validation work in Phase 3 of the roadmap.

## Partnerships

- **Health NGOs** — co-branded advisories, distribution into existing community
  health programs, credibility for the health-effect copy shown in the app.
- **Telcos** — SMS alerts for non-smartphone users, extending reach well beyond
  the app's own install base; this is the single biggest lever for coverage in
  markets where smartphone penetration is the bottleneck, not awareness.
- **Mask / air-purifier sellers** — affiliate revenue on the exact moment the
  app already tells a user to act ("wear an N95 today") — a natural,
  non-intrusive commerce layer rather than generic ads.

## Costs and unfair advantage

Costs run across satellite/data API access, cloud hosting (API + app), and the
team; not yet broken into a per-tier model. Current proxy for "what this costs
to run": the funding ask itself, **$15,000–$25,000 for 12 months of runway**,
plus pilot city and regulator partnerships (see `docs/pitch/BUSINESS_MODEL.md`).

**Unfair advantage:** satellite-derived coverage works everywhere, including the
overwhelming majority of African locations with no ground sensor at all — where
IQAir, OpenWeather, and similar competitors have literally no data to sell. The
multi-pollutant, personalized, WHO-cited product built in this update is the
layer that turns that coverage advantage into something people actually act on
and pay for.

## What's real vs. what's a placeholder

| Claim | Status |
|---|---|
| Freemium traction (46K+ requests, 5 countries, NASA award) | Real |
| Institutional/API rate-limit tiers (10/min vs 6,000/min) | Real, already built |
| Institutional/API pricing bands | Benchmark only, not set |
| Government/NGO contract bands | Illustrative estimate, not a signed deal |
| B2B (insurers/logistics/hospitals) as a revenue line | Not yet productized |
| Affiliate/telco partnerships | Not yet signed |
| Cost structure per tier | Not yet broken out |
| Funding ask ($15K–$25K / 12mo runway) | Real, current ask |

Sources: [IQAir API plans](https://www.iqair.com/in-en/air-pollution-data-api/plans),
[OpenWeather pricing overview](https://apio.sh/apis/openweather),
[Grand View Research — air quality monitoring market](https://www.grandviewresearch.com),
WHO 2021 Air Quality Guidelines.
