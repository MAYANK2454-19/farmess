# Farmess — CodeFarm, Team 13

**Know the market. Understand the costs. Decide with confidence.**

Farmess is a farmer-first decision-support product for comparing feasible selling options for a specific produce lot. It focuses on dated mandi observations, real buyer offers where available, entered or verified selling costs, and post-harvest constraints. It does not guarantee a price, buyer, profit or sale.

## Current build status

This repository begins the shared application shell and the first farmer-lot-entry UI slice. It is a team build preview, not a completed product.

- [x] Next.js App Router + TypeScript foundation
- [x] Farmess design tokens from the Round 2 UX documentation
- [x] Responsive farmer workspace shell and route navigation
- [x] Farmer overview empty/no-data states (no fabricated records)
- [x] My Produce collection route with an honest first-use empty state
- [x] Produce-lot form with local review preview
- [ ] Supabase authentication, profile and role enforcement
- [ ] Database migrations and row-level security
- [ ] Persistent produce lots
- [ ] Market-data adapter and provenance
- [ ] Net-return calculator and tests
- [ ] Buyer offers, logistics and notifications
- [ ] Figma screenshot parity review

The live Figma file could not be inspected during this bootstrap because the connected Figma MCP account reached its call limit. The first UI uses the documented Round 2 tokens and screen inventory; it must be visually compared against the actual frames before being described as pixel-matched.

## Stack

- Next.js 16 App Router and React 19
- TypeScript
- Tailwind CSS 4 (with project CSS variables for the specified Farmess design tokens)
- Supabase is planned for Auth and Postgres; no Supabase project or secrets are assumed in this scaffold
- Zod, domain services, migrations and tests will be added in the feature PRs that own them

## Local development

Requirements: Node.js 22 or newer.

The initial bootstrap package has no committed lockfile because dependency installation was unavailable in the authoring environment. Run `npm install` once, commit the generated `package-lock.json`, and then use `npm ci` for repeatable installs. CI temporarily supports both states.

```bash
npm install
npm run format
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000.

The initial preview runs without Supabase credentials. The My Produce route is an empty collection state. The produce-lot form currently validates browser-required fields and displays a local review only; it does not save or publish a lot.

## Quality checks

```bash
npm run format:check
npm run lint
npm run typecheck
npm run build
```

## Product and design references

- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — shared product, engineering and collaboration contract.
- [`docs/ROUND2_UX_DOCUMENTATION.docx`](./docs/ROUND2_UX_DOCUMENTATION.docx) — Round 2 approved UX requirements.
- [`docs/FARMESS_Master_Figma_Execution_Brief.md`](./docs/FARMESS_Master_Figma_Execution_Brief.md) — detailed Figma and prototype handoff brief.
- [`docs/INITIAL_BACKLOG.md`](./docs/INITIAL_BACKLOG.md) — first six owner-specific build issues and integration gates.
- [`GITHUB_VERCEL_SETUP.md`](./GITHUB_VERCEL_SETUP.md) — private GitHub and Vercel connection steps.

## Collaboration

Read [`ARCHITECTURE.md`](./ARCHITECTURE.md) before taking an issue. Work on one issue and branch per feature, do not push directly to `main`, and submit focused pull requests. Announce edits to shared files such as `package.json`, `globals.css`, shared layouts, migrations and generated database types.

The six initial lanes are:

| Member | Initial ownership |
|---|---|
| Mayank | App shell, farmer journey, integration and route coordination |
| Prince Kumar | Auth, Postgres schema, migrations and RLS |
| Bhavishya Jain | Figma parity, component system and responsive UI |
| Yash | Market-source verification and data adapter |
| Rajan Kumar | Net-return calculation and comparison |
| Atharv Singh | Buyer offers, logistics, activity, notifications and E2E QA |

Everyone must contribute meaningfully to frontend, backend/data, and tests/documentation/review over the project. Ownership is a starting point, not a silo.

## Data truthfulness

Do not introduce sample prices, buyer details, operator availability, offers, user metrics or market trends unless labelled as demo data. Unknown costs are not zero. Market records must show source, observation date, retrieval time, unit and freshness state. Predictions and AI grading are outside the baseline scope.

## Deployment

Vercel is the intended deployment target. After the private GitHub repository is created and connected, enable automatic preview deployments for branches/PRs and deploy `main` to the shared team review URL. Add only public-safe Supabase keys to Vercel once the project is configured; keep service-role credentials server-only.
