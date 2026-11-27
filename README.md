# Farmess — CodeFarm, Team 13

**Know the market. Understand the costs. Decide with confidence.**

Farmess is a farmer-first decision-support application for comparing feasible selling options for a specific produce lot. It combines dated mandi observations, actual buyer offers where available, explicit selling costs and post-harvest constraints. It does not guarantee a price, buyer, profit or sale.

- **Live application:** https://farmess.vercel.app
- **API reference (Swagger / OpenAPI):** https://farmess.vercel.app/api-docs · raw spec `/openapi.json` (importable into Postman)

## Round 3 evidence map

| Evaluation area                 | Where to look                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Working backend and core flow   | 33 route handlers in [`src/app/api`](./src/app/api); live at the URL above                                                                                                                                                                                                                                                                                                         |
| Architecture and code structure | See [Project structure](#project-structure) below                                                                                                                                                                                                                                                                                                                                  |
| Database and data handling      | 27 reviewed migrations in [`supabase/migrations`](./supabase/migrations) (constraints, RLS, audited RPCs); validators in `src/features/*`; demo seed in [docs/DEMO_DATA.md](./docs/DEMO_DATA.md)                                                                                                                                                                                   |
| Reliability                     | Secrets only in environment variables ([`.env.example`](./.env.example)); structured JSON request/error logging with request IDs and `Server-Timing` ([`src/lib/observability/logger.ts`](./src/lib/observability/logger.ts), [`src/instrumentation.ts`](./src/instrumentation.ts))                                                                                                |
| Testing and performance         | 500+ unit/contract tests (`npm test`), ML tests (`ml/tests`), CI on every branch; per-request `durationMs` in logs and `Server-Timing` headers                                                                                                                                                                                                                                     |
| Innovation and problem fit      | Net realisation after every cost, dated mandi provenance, prices fetched automatically for the crop and area a person looks up, forecasts (statistical, ML and weather-aware) shown only when they beat the baseline, ratings that feed an explainable logistics ranking, and the interface in 15 languages                                                                        |
| Security and guardrails         | Supabase Auth; trusted roles (farmer, buyer, operator, admin) from server-controlled `app_metadata`; idle and absolute session limits enforced on the server; admin sign-in on a private, unlinked address; route, API and Row Level Security checks; input validation; same-origin checks on mutations; security headers ([docs/SESSION_SECURITY.md](./docs/SESSION_SECURITY.md)) |
| Roles and contributions         | Commit history and [docs/INITIAL_BACKLOG.md](./docs/INITIAL_BACKLOG.md) owner lanes                                                                                                                                                                                                                                                                                                |

## Current build status

- [x] Next.js App Router, TypeScript, responsive workspace with collapsible sidebar
- [x] Interface in English and 14 Indian languages, switchable anywhere ([docs/LANGUAGES.md](./docs/LANGUAGES.md); machine-translated, not yet reviewed by speakers)
- [x] Supabase Auth SSR: sign-in/up, callback, password reset, sign-out; role-aware login portals
- [x] Session security: 30-minute idle and 12-hour limits (15 minutes and 8 hours for admins), signed-in devices list, private admin sign-in address ([docs/SESSION_SECURITY.md](./docs/SESSION_SECURITY.md))
- [x] Trusted roles with admin-reviewed buyer/operator access requests (admin can never be requested)
- [x] Role-specific profiles: farmer transport, vehicle, farm size and crops; buyer and operator business details
- [x] Supabase schema, Row Level Security on every table, private farmer lot persistence
- [x] Produce lots, quality inspection history and selling-window reminders
- [x] Buyer requirements, published-lot discovery and guarded offer lifecycle
- [x] Operator transport/storage listings, capacity/availability, request handling and cancellation
- [x] Notifications, profile/consent audit and sale-activity persistence
- [x] Sale steps (dispatched, delivered, paid) confirmed by each side, and 1–5 star ratings after completed sales and service requests ([docs/RATINGS_AND_SALE_STEPS.md](./docs/RATINGS_AND_SALE_STEPS.md))
- [x] Mandi prices fetched automatically when a farmer or buyer looks up a crop for their area: today's reports and up to a year of history ([docs/AUTOMATIC_PRICE_FETCH.md](./docs/AUTOMATIC_PRICE_FETCH.md))
- [x] Admin console: access requests, optional bulk price imports, data health, provider verification
- [x] Source-attributed OGD India / AGMARKNET adapter with validation and stale-data labelling
- [x] PostGIS locality discovery, explainable logistics ranking on real road distance (HeiGIT; straight-line fallback) and provider ratings, per-km trip-cost estimates and Open-Meteo weather
- [x] Price trend with a statistical, a pooled machine-learning (gradient-boosted trees) and a weather-aware forecast with dry / forecast / heavy-rain scenarios, each shown only when it beats the baseline on unseen reports ([docs/WEATHER_PRICE_FORECAST.md](./docs/WEATHER_PRICE_FORECAST.md))
- [x] Offline ML research pipelines (gradient-boosted forecaster, logistics preference ranker)
- [x] OpenAPI reference, structured logging and production deployment on Vercel
- [ ] A personal `DATA_GOV_IN_API_KEY` (the public sample key works but returns 10 rows per request, so first fetches are slow)
- [ ] Translations read and corrected by a speaker of each language
- [ ] Verified real provider directory and buyer participants
- [ ] Enough genuine observations and feedback to train and approve ML models
- [ ] Production email delivery (Supabase custom SMTP) and full multi-account E2E evidence

The detailed boundary between implemented and pending functionality is in [docs/APP_INTEGRATION_STATUS.md](./docs/APP_INTEGRATION_STATUS.md). Product requirements and collaboration rules remain in [ARCHITECTURE.md](./ARCHITECTURE.md).

## Project structure

| Layer                 | Location                                                      | Responsibility                                                        |
| --------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------- |
| Routes / controllers  | `src/app/api/**/route.ts`                                     | HTTP methods, auth and role checks, status codes, JSON responses      |
| Services / validation | `src/features/*`                                              | Domain rules and request validators (tested in `*.test.ts`)           |
| Shared libraries      | `src/lib/*`                                                   | Auth session, Supabase clients, market-data adapter, weather, logging |
| Languages             | `src/i18n/*`, `public/i18n/*.json`                            | String catalog, in-page translator and one dictionary per language    |
| Models / database     | `supabase/migrations/*.sql`                                   | Tables, constraints, RLS policies, triggers and audited RPCs          |
| UI                    | `src/app/**/page.tsx`, `src/components`, `src/features/*.tsx` | Role workspaces and forms                                             |
| ML                    | `ml/`                                                         | Offline export, training and evaluation scripts                       |

## Stack

- Next.js 16 App Router and React 19
- TypeScript and Tailwind CSS 4
- Supabase Auth, Postgres and PostGIS
- Leaflet for locality maps
- Python 3.12, scikit-learn and joblib for offline ML candidate training

## Local development

Requirements: Node.js 22 or newer.

1. Clone the repository and stay on `main`.
2. Run `npm ci` to install the synchronized dependency lockfile.
3. Copy `.env.example` to `.env.local` and fill in `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. See [docs/LOCAL_DEVELOPMENT.md](./docs/LOCAL_DEVELOPMENT.md) for exact steps and local Auth redirect configuration.
4. Run `npm run dev` and open http://localhost:3000.
5. Optional: load labelled demo accounts and records with `npm run seed:demo` (see [docs/DEMO_DATA.md](./docs/DEMO_DATA.md)).

The Next.js app and its API handlers run on localhost. The default development guide connects them to the team's existing Supabase project; data created during that run is stored in that shared cloud database.

## ML and data truthfulness

The live price forecast (`src/lib/market-data/price-forecast.ts`) is Holt's damped-trend smoothing on log modal prices, one step per market report. It needs at least 40 report days for a crop at a mandi, picks its smoothing settings on older reports only, and is tested walk-forward on up to the last 30 reports against the "today's price stays the same" (persistence) baseline. A forecast is shown only if it beats that baseline; otherwise farmers see the real trend and the reason. Reports older than 14 days are never forecast. A second, machine-learning forecast (`src/lib/market-data/ml-forecast.ts`) uses gradient-boosted regression trees trained on every saved crop and mandi in the state (pooled), predicting the change in log price over the next 1-7 reports from recent changes, volatility, season and reporting gaps. Its depth and number of rounds are chosen on a validation period, and it is tested on the target mandi's latest reports against the same baseline; it is shown only if it beats it. Renamed AGMARKNET listings of one mandi are joined before modelling (`mandi-key.ts`). A third forecast (`src/lib/market-data/weather-forecast.ts`) adds each district's rain and temperature from Open-Meteo to the same kind of model, trained on every mandi of one crop in the state. It is tested the hard way: on unseen reports it gets only weather known on the day of the forecast, and must still beat the baseline to be shown; the error with the real weather of those days is reported alongside as the best case. When shown, it also gives the expected price for a dry spell, the forecast rain and heavy rain.

The two Python pipelines are offline research trainers, not live services. The gradient-boosted forecaster needs at least 120 unique dated observations per market series; the logistics ranker needs at least 300 clear feedback labels from 30 users and 20 provider listings. Neither is used by the live app until real data meets these thresholds.

The live logistics ranking is explainable rules-based scoring over distance, capacity, crop, date, cold-chain, verification, pricing information and the provider's star ratings (at most 5 points out of 100 either way). The buyer-lot matcher is deterministic. Neither live workflow is presented as ML. Market prices are never seeded or invented: every saved price is a dated AGMARKNET report fetched from data.gov.in and validated by the database before it is stored.

## Quality checks

```powershell
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
```

CI runs formatting, lint, typecheck, tests and build checks on every branch. Do not merge a PR while required checks are failing.

## Design and product references

- [ARCHITECTURE.md](./ARCHITECTURE.md) — source of truth for product scope, privacy and backend behaviour.
- [docs/APP_INTEGRATION_STATUS.md](./docs/APP_INTEGRATION_STATUS.md) — current integration status and outstanding work.
- [docs/SUPABASE_BACKEND.md](./docs/SUPABASE_BACKEND.md) — connected project, tables and applied migration ledger.
- [docs/EXTERNAL_INTEGRATIONS.md](./docs/EXTERNAL_INTEGRATIONS.md) — OGD India, HeiGIT and Open-Meteo setup.
- [docs/AUTOMATIC_PRICE_FETCH.md](./docs/AUTOMATIC_PRICE_FETCH.md), [docs/WEATHER_PRICE_FORECAST.md](./docs/WEATHER_PRICE_FORECAST.md), [docs/SESSION_SECURITY.md](./docs/SESSION_SECURITY.md), [docs/RATINGS_AND_SALE_STEPS.md](./docs/RATINGS_AND_SALE_STEPS.md), [docs/LANGUAGES.md](./docs/LANGUAGES.md) — the newest features in plain words.
- [docs/LOCAL_DEVELOPMENT.md](./docs/LOCAL_DEVELOPMENT.md) — Windows PowerShell startup instructions.
- [docs/INITIAL_BACKLOG.md](./docs/INITIAL_BACKLOG.md) — owner lanes and review agreement.
- [Farmess Round 2 Figma](https://www.figma.com/design/S0JzUA0lpaApwy8ifPeCZn/CodeFarm---Farmess-%7C-Round-2-UX-Design---Prototype?node-id=0-1).

## Collaboration

Use focused branches and pull requests. Coordinate shared migrations, generated database types, package files and global styles before editing them. Keep real personal data and credentials out of Git and issue comments.

## Deployment

Production deploys from `main` on Vercel (`vercel.json` enables only `main` and `integrate/**` builds so feature branches do not use the Hobby deployment quota). Server-only values (`DATA_GOV_IN_API_KEY`, `HEIGIT_API_KEY`, `OPEN_METEO_CUSTOMER_API_KEY` or `OPEN_METEO_NON_COMMERCIAL_USE`, and `FARMESS_SERVER_SECRET`) are set in Vercel environment variables. `FARMESS_SERVER_SECRET` lets the server write fetched prices and decides the private admin sign-in address; the database stores only a hash of the value derived from it. `GEMINI_API_KEY` is used only by the local translation script and is not set in Vercel. Never add a service-role/secret key to browser code or a `NEXT_PUBLIC_*` variable.
