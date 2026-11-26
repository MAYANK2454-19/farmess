# Farmess — CodeFarm, Team 13

**Know the market. Understand the costs. Decide with confidence.**

Farmess is a farmer-first decision-support application for comparing feasible selling options for a specific produce lot. It combines dated mandi observations, actual buyer offers where available, explicit selling costs and post-harvest constraints. It does not guarantee a price, buyer, profit or sale.

- **Live application:** https://farmess.vercel.app
- **API reference (Swagger / OpenAPI):** https://farmess.vercel.app/api-docs · raw spec `/openapi.json` (importable into Postman)

## Round 3 evidence map

| Evaluation area                 | Where to look                                                                                                                                                                                                                                                                       |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Working backend and core flow   | 24 route handlers in [`src/app/api`](./src/app/api); live at the URL above                                                                                                                                                                                                          |
| Architecture and code structure | See [Project structure](#project-structure) below                                                                                                                                                                                                                                   |
| Database and data handling      | 22 reviewed migrations in [`supabase/migrations`](./supabase/migrations) (constraints, RLS, audited RPCs); validators in `src/features/*`; demo seed in [docs/DEMO_DATA.md](./docs/DEMO_DATA.md)                                                                                    |
| Reliability                     | Secrets only in environment variables ([`.env.example`](./.env.example)); structured JSON request/error logging with request IDs and `Server-Timing` ([`src/lib/observability/logger.ts`](./src/lib/observability/logger.ts), [`src/instrumentation.ts`](./src/instrumentation.ts)) |
| Testing and performance         | 400+ unit/contract tests (`npm test`), ML tests (`ml/tests`), CI on every branch; per-request `durationMs` in logs and `Server-Timing` headers                                                                                                                                      |
| Innovation and problem fit      | Net realisation after every cost, dated mandi provenance, rules-based logistics ranking, offline ML with walk-forward evaluation and human approval                                                                                                                                 |
| Security and guardrails         | Supabase Auth; trusted roles (farmer, buyer, operator, admin) from server-controlled `app_metadata`; role-aware login; route, API and Row Level Security checks; input validation; same-origin checks on mutations                                                                  |
| Roles and contributions         | Commit history and [docs/INITIAL_BACKLOG.md](./docs/INITIAL_BACKLOG.md) owner lanes                                                                                                                                                                                                 |

## Current build status

- [x] Next.js App Router, TypeScript, bilingual (English/Hindi) responsive workspace with collapsible sidebar
- [x] Supabase Auth SSR: sign-in/up, callback, password reset, sign-out; role-aware login portals
- [x] Trusted roles with admin-reviewed buyer/operator access requests (admin can never be requested)
- [x] Role-specific profiles: farmer transport, vehicle, farm size and crops; buyer and operator business details
- [x] Supabase schema, Row Level Security on every table, private farmer lot persistence
- [x] Produce lots, quality inspection history and selling-window reminders
- [x] Buyer requirements, published-lot discovery and guarded offer lifecycle
- [x] Operator transport/storage listings, capacity/availability, request handling and cancellation
- [x] Notifications, profile/consent audit and sale-activity persistence
- [x] Admin console: access requests, past and current mandi price imports, data health, provider verification
- [x] Source-attributed OGD India / AGMARKNET adapter with validation and stale-data labelling
- [x] PostGIS locality discovery, explainable logistics ranking, optional road routing and Open-Meteo weather
- [x] Price trend and back-tested short-term forecast from real mandi history (shown only when it beats the baseline)
- [x] Offline ML research pipelines (gradient-boosted forecaster, logistics preference ranker)
- [x] OpenAPI reference, structured logging and production deployment on Vercel
- [ ] Real mandi observations imported (requires the owner's `DATA_GOV_IN_API_KEY`)
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

The live price forecast (`src/lib/market-data/price-forecast.ts`) is Holt's damped-trend smoothing on log modal prices, one step per market report. It needs at least 40 report days for a crop at a mandi, picks its smoothing settings on older reports only, and is tested walk-forward on up to the last 30 reports against the "today's price stays the same" (persistence) baseline. A forecast is shown only if it beats that baseline; otherwise farmers see the real trend and the reason. Reports older than 14 days are never forecast.

The two Python pipelines are offline research trainers, not live services. The gradient-boosted forecaster needs at least 120 unique dated observations per market series; the logistics ranker needs at least 300 clear feedback labels from 30 users and 20 provider listings. Neither is used by the live app until real data meets these thresholds.

The live logistics ranking is explainable rules-based scoring over distance, capacity, crop, date, cold-chain, verification and pricing information. The buyer-lot matcher is deterministic. Neither live workflow is presented as ML. Market prices are never seeded or invented.

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
- [docs/LOCAL_DEVELOPMENT.md](./docs/LOCAL_DEVELOPMENT.md) — Windows PowerShell startup instructions.
- [docs/INITIAL_BACKLOG.md](./docs/INITIAL_BACKLOG.md) — owner lanes and review agreement.
- [Farmess Round 2 Figma](https://www.figma.com/design/S0JzUA0lpaApwy8ifPeCZn/CodeFarm---Farmess-%7C-Round-2-UX-Design---Prototype?node-id=0-1).

## Collaboration

Use focused branches and pull requests. Coordinate shared migrations, generated database types, package files and global styles before editing them. Keep real personal data and credentials out of Git and issue comments.

## Deployment

Production deploys from `main` on Vercel (`vercel.json` enables only `main` and `integrate/**` builds so feature branches do not use the Hobby deployment quota). Server-only provider keys (`DATA_GOV_IN_API_KEY`, `HEIGIT_API_KEY`, `OPEN_METEO_CUSTOMER_API_KEY` or `OPEN_METEO_NON_COMMERCIAL_USE`) are set in Vercel environment variables. Never add a service-role/secret key to browser code or a `NEXT_PUBLIC_*` variable.
