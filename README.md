# 🌊 Njord — Mortgage Calculator

A client-side mortgage calculator (Vite + React + TypeScript). Njord is the
Norse god of the sea and of wealth — appropriately, he watches over your
biggest purchase.

Generic fixed-rate amortization core with a **US cost layer** (property tax,
homeowners insurance, PMI with the 80%-LTV auto-drop, HOA), **extra-payment
modeling**, **up to four side-by-side scenarios**, **shareable plans**
(URL + localStorage), and an optional **comparable-sales lookup** (recent
sold prices near an address). All loan math runs in the browser with no
backend; only the comps feature calls external APIs.

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
```

Other scripts:

```bash
npm test           # vitest unit tests (engine + persistence codecs)
npm run typecheck  # tsc --noEmit
npm run build      # typecheck + production bundle in dist/
npm run preview    # serve the production build
```

## Deploy (GitHub Pages)

Every push to `main` builds and publishes the app to
<https://nivweisman.github.io/Njord/> via
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) (also
runnable by hand from the Actions tab). The workflow builds with
`--base=/Njord/` because project pages serve under the repo subpath —
a plain `npm run build` produces root-absolute asset URLs that 404 there.
One-time setup before the first run (the workflow token can't create
the Pages site itself): **Settings → Pages → Source: GitHub Actions**.
Then push (or re-run the failed workflow) and every deploy is automatic.

## Features

- **Monthly payment + KPI tiles** — P&I, initial all-in monthly cost, total
  interest, payoff time, PMI total, and interest saved by extra payments.
- **Amortization schedule** — yearly or monthly granularity; also serves as
  the accessible table view for both charts.
- **Charts** — remaining balance per scenario (line) and monthly payment
  composition: principal / interest / recurring extra (stacked area), with
  crosshair tooltips, keyboard navigation (arrow keys, Shift = 1 year), and
  light/dark theming.
- **Extra payments** — monthly, yearly, or one-time; per-payment start/end
  months; savings vs. the no-extras baseline are computed exactly.
- **Scenario comparison** — up to 4 scenarios (tabs), overlaid on the balance
  chart plus a metric-by-metric table with the best value bolded.
- **Save / load / share** — named plans in localStorage, autosave of the last
  session, and a "Copy link" button that encodes the whole plan into the URL
  (base64url JSON in the `p` query parameter).

## Comps — recent sales nearby

Enter a street address plus target beds/baths and Njord finds sold prices of
similar homes (±1 bed/bath, last 3 years), bucketed three ways: **same
street**, **nearby streets** (≤0.5 mi), and **same school district**. Any
bucket's median can be pushed into the active scenario's home price.

Data sources (`src/comps/`):

| Step | Service | Auth |
| --- | --- | --- |
| Address → coordinates, street, ZIP, district GEOID | US Census geocoder (JSONP — the service sends no CORS headers) | none |
| District GEOID → boundary polygon | Census TIGERweb ArcGIS REST (`TIGERweb/School`, layers 0/1/2) | none |
| Recently-sold homes in the ZIP | "Realty in US" (apidojo, realtor.com MLS records) on RapidAPI | your RapidAPI key |

**Provider reality check:** Zillow retired its official public API, and as
of July 2026 RapidAPI has delisted its community Zillow scrapers as well
(every known gateway host answers "API doesn't exists"). Sold data
therefore comes from realtor.com via the long-running **Realty in US** API.
Create a free RapidAPI account, subscribe to that API's free tier, and
paste the key into the panel (stored in localStorage only — never in share
URLs or saved plans; same for the address). Quotas on free tiers are small,
so results are cached locally and each run fetches at most two pages. The
provider is isolated in [src/comps/realtor.ts](src/comps/realtor.ts) —
swapping sources touches that one module.

Known limitations: the sales search covers the subject's ZIP, so the
school-district bucket only tags sales *within that ZIP*; classification
trusts the provider's beds/baths/coordinates; sales with no sold date are
dropped.

## Engine assumptions (deliberate simplifications)

The engine ([src/engine/mortgage.ts](src/engine/mortgage.ts)) is a standard
fully-amortizing fixed-rate model:

- Payment = `P·r·(1+r)ⁿ / ((1+r)ⁿ − 1)`, monthly compounding, zero-rate limit
  `P/n`. Full float precision internally; rounding happens only at display.
- **PMI**: `pmiAnnualPct × original loan / 12`, charged while the
  start-of-month balance exceeds 80% of the purchase price, then dropped
  automatically (no appraisal events, no 78%/midpoint nuances).
- **Escrow**: `(price × tax% + insurance) / 12`, constant for the loan's life
  (no reassessment); HOA constant.
- Extra payments apply to principal in the month they land and are clamped to
  the remaining balance.

Not modeled (yet): ARMs, CPI-linked tracks (Israeli תמהיל), points, closing
costs, refinancing, tax deductions.

## Layout

| Path | Responsibility |
| --- | --- |
| `src/engine/` | Pure loan math + schedule types. No React, no I/O. |
| `src/state/` | Plan model + sanitize gate, defaults, URL codec, localStorage. |
| `src/charts/` | Hand-rolled SVG charts (dataviz-spec marks, tooltips, legends). |
| `src/comps/` | Comparable-sales pipeline: geocode, district polygon, sold-search provider, pure classification. |
| `src/components/` | Form, tabs, KPI tiles, tables, saved-plans panel. |
| `src/App.tsx` | State owner + persistence wiring; thin coordinator. |

Every externally sourced payload (URL parameter, localStorage) passes through
`sanitizeState` ([src/state/model.ts](src/state/model.ts)) — hostile or stale
data is clamped/repaired, never trusted.

## Tests

Engine and codec tests live next to their sources (`*.test.ts`) and run in
plain Node (no DOM): amortization reference values, zero-rate and payoff
edges, PMI drop timing, extra-payment conservation, base64url round-trips
(including non-ASCII names), and sanitize-gate repairs.

## Roadmap ideas

- Israeli multi-track mix (prime / fixed / CPI-linked) on the same engine.
- Points & closing costs; refinance comparison.
- CSV export of the schedule.
