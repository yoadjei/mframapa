# mframapa business model

One product, three ways to monetize it, one growth engine underneath. Per the investor pitch framework this is built against: highlight figures only — no five-year forecast, no line-by-line DCF. Real numbers where we have them, clearly flagged placeholders where we don't.

## The model in one line

Free access drives adoption and data. Two paid tiers — recurring institutional/API subscriptions and one-off government/NGO contracts — drive revenue. Costs run underneath all three.

```
                    mframapa
              (AI + satellite estimates)
                        |
        ________________|________________
       |                |                |
   Freemium      Institutional/API   Government & NGO
  (individuals)  (schools, clinics,   (regulators,
                   employers, devs)   city dashboards)
       |                |                |
   ADOPTION          REVENUE          REVENUE
  (users, data,   (subscriptions)   (contracts)
     trust)
```

## Tier 1 — Freemium

**Who:** individuals and families, self-serve, no signup.
**Mechanism:** free, forever. This tier earns $0 on purpose.
**Highlight figures (real, current):**
- 46,000+ requests in the last 30 days
- Live usage in 5 countries: Ghana, US, France, Netherlands, Canada
- "Best Use of Data" — NASA International Space Apps Challenge, 2025

**Job to do:** adoption, not revenue. This is the top of the funnel and the source of the usage data that makes the other two tiers credible.

## Tier 2 — Institutional / API

**Who:** schools (attendance/activity decisions), clinics (patient advisories), employers (outdoor-labor safety calls), developers building on top of mframapa data.
**Mechanism:** a paid API key at a higher rate limit than the free tier. This isn't hypothetical — the backend already enforces the split: public keys are capped at 10 requests/minute, institutional keys at 6,000 requests/minute (`backend/api/security.py`). The product for this tier exists; the price does not, yet.

**Highlight figures (market comparables, not yet our price):**
| Comparable | Free tier | Mid tier | Top tier |
|---|---|---|---|
| IQAir AirVisual API | 500 calls/day | $399/mo (100K calls/day) | $999/mo (1M calls/day) |
| OpenWeather API | limited free | ~$180/mo (Developer) | $3,000+/mo (Enterprise) |

*Suggested starting point for mframapa, pending real pricing work — priced well below IQAir/OpenWeather, and split by region using the same ability-to-pay logic as the Government/NGO tier below:*
- **Africa:** ~$20–$100/mo
- **International:** ~$60–$300/mo

*These are benchmarks, not committed prices — need validation against actual schools/clinics/developer willingness to pay.*

**Why it matters to investors:** recurring revenue, and the underlying rate-limit infrastructure is already built, not roadmap.

## Tier 3 — Government & NGO

**Who:** regulators and NGOs procuring city-level air quality dashboards.
**Mechanism:** direct contract, not self-serve, priced by region rather than one flat rate.
**Highlight figures (illustrative, not yet real contracts):**
- Africa: ~$3K–$8K/yr per contract
- International: ~$10K–$25K/yr per contract

The gap isn't arbitrary — it's the same ability-to-pay logic SaaS companies use for PPP-adjusted regional pricing, applied here so African regulators and NGOs (the market mframapa exists to serve first) aren't priced out, while international contracts carry a higher rate that can subsidize the African tier. These bands are estimates to reason with, not numbers pulled from a signed deal — real contract values need actual business development conversations to confirm.

**Why it matters to investors:** the largest per-deal revenue, and the tier most likely to make mframapa a default civic data layer rather than just an app.

## Costs (the other side of the ledger)

Satellite/data API costs, cloud hosting for the app and API, and the team. Not yet broken into a per-tier cost model — the current proxy for "what this costs to run" is the funding ask itself: **$15,000–$25,000 for 12 months of runway**, plus pilot city and regulator partnerships.

## Market context (why now)

Global air quality monitoring market: **$5.8B (2024) → $8.9B by 2030, 7.5% CAGR** (Grand View Research). Africa is urbanizing faster than any other region, and no African-specific market figure is separately published yet — which is itself an opening, not a gap.

## What's real vs. what's placeholder

| Claim | Status |
|---|---|
| Freemium traction numbers (46K+ requests, 5 countries, NASA award) | Real |
| Institutional/API rate-limit tiers (10/min vs 6,000/min) | Real, already built |
| Institutional/API pricing (Africa ~$20-100/mo, Intl ~$60-300/mo) | Benchmark only, not set |
| Government/NGO contract bands (Africa ~$3K-8K/yr, Intl ~$10K-25K/yr) | Illustrative estimate, not a signed deal |
| Cost structure per tier | Not yet broken out |
| Global market size / CAGR | Real, sourced |

---

Sources: [IQAir API plans](https://www.iqair.com/in-en/air-pollution-data-api/plans), [OpenWeather pricing overview](https://apio.sh/apis/openweather), [Grand View Research — air quality monitoring market](https://www.grandviewresearch.com)
