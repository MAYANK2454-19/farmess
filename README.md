# Farmess — CodeFarm, Team 13

**Know the market. Understand the costs. Decide with confidence.**

Farmess is a farmer-first decision-support application for comparing feasible selling options for a specific produce lot. It combines dated mandi observations, actual buyer offers where available, explicit selling costs and post-harvest constraints. It does not guarantee a price, buyer, profit or sale.

## Current build status

The integrated backend branch contains the first connected application and database workflows. It is a working collaborative preview, not a production-complete marketplace.

- [x] Next.js App Router, TypeScript and responsive workspace shell
- [x] Supabase Auth SSR clients, cookie refresh, sign-in/up, callback, password reset and sign-out
- [x] Supabase schema, role-aware Row Level Security and private farmer lot persistence
- [x] Farmer inventory selling-window reminders based on entered availability and sell-by dates
- [x] Buyer requirements, published-lot discovery and guarded offer lifecycle
- [x] Operator transport/storage listings, provider capacity/availability updates and farmer request cancellation
- [x] Notification, profile/consent and sale-activity persistence
- [x] Admin market-data import, forecast review, read-only coverage/freshness diagnostics and provider verification audit
- [x] Source-attributed market-price adapter and admin-only ingestion endpoint
- [x] PostGIS locality discovery and explainable logistics recommendation ranking
- [x] Offline candidate pipelines for mandi-price forecasting and logistics preference ranking
- [ ] Trusted buyer/operator onboarding and admin account management
- [ ] Verified real provider directory and sufficient local service listings
- [ ] Market observations and feedback data at the minimum scale required to train/evaluate ML
- [ ] Production-grade email delivery, complete RLS-denial/E2E test evidence and production deployment

The detailed boundary between implemented and pending functionality is in [docs/APP_INTEGRATION_STATUS.md](./docs/APP_INTEGRATION_STATUS.md). Product requirements and collaboration rules remain in [ARCHITECTURE.md](./ARCHITECTURE.md).

## Stack

- Next.js 16 App Router and React 19
- TypeScript and Tailwind CSS 4
- Supabase Auth, Postgres and PostGIS
- Leaflet for locality maps
- Python 3.12, scikit-learn and joblib for offline ML candidate training

## Local development

Requirements: Node.js 22 or newer.

1. Check out the integrated backend branch for PR #60.
2. Run `npm ci` to install the synchronized dependency lockfile.
3. Create a root `.env.local` with `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. See [docs/LOCAL_DEVELOPMENT.md](./docs/LOCAL_DEVELOPMENT.md) for exact steps and local Auth redirect configuration.
4. Run `npm run dev` and open http://localhost:3000.

The Next.js app and its API handlers run on localhost. The default development guide connects them to the team's existing Supabase project; data created during that run is stored in that shared cloud database. A separate local Supabase/Postgres stack is not started by these steps.

## ML and data truthfulness

The two Python pipelines are offline candidate trainers, not always-on AI services. The market forecaster requires at least 90 unique dated observations per market series and must outperform a persistence baseline on MAE and sMAPE. The logistics ranker requires at least 300 clear feedback labels, 30 users and 20 provider listings. Candidates require human review; no forecast or learned logistics ranking is currently approved.

The live logistics ranking is explainable rules-based scoring over distance, capacity, crop, date, cold-chain, verification and pricing information. The buyer-lot matcher is deterministic. Do not call either live workflow ML. The team database had no market observations, provider listings or feedback records at the time of integration inspection.

## Quality checks

Run:

```powershell
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
```

CI runs formatting, lint, typecheck, tests and build checks. Do not merge a PR while required checks are failing.

## Design and product references

- [ARCHITECTURE.md](./ARCHITECTURE.md) — source of truth for product scope, privacy and backend behaviour.
- [docs/APP_INTEGRATION_STATUS.md](./docs/APP_INTEGRATION_STATUS.md) — current integration status and outstanding work.
- [docs/LOCAL_DEVELOPMENT.md](./docs/LOCAL_DEVELOPMENT.md) — Windows PowerShell startup instructions.
- [docs/INITIAL_BACKLOG.md](./docs/INITIAL_BACKLOG.md) — original owner lanes and review agreement.
- [Farmess Round 2 Figma](https://www.figma.com/design/S0JzUA0lpaApwy8ifPeCZn/CodeFarm---Farmess-%7C-Round-2-UX-Design---Prototype?node-id=0-1).

## Collaboration

Use focused branches and pull requests. Do not push directly to protected `main`. Coordinate shared migrations, generated database types, package files and global styles before editing them. Keep real personal data and credentials out of Git and issue comments.

## Deployment

Vercel is the current preview target. A Vercel preview/build limit does not prevent local development. Check the plan's current terms before using it for commercial Farmess operation. Never add a service-role/secret key to browser code or a `NEXT_PUBLIC_*` variable.
