# Farmess — Initial collaborative build backlog

**Project:** CodeFarm · Team 13 · Farmess  
**Team lead / integration owner:** Mayank  
**Status:** Draft backlog to convert into GitHub Issues after the private repository is created.

This backlog starts the six contributors in separate ownership areas. It is not a request for six people to build disconnected versions of the application. Each item must use the contracts in `ARCHITECTURE.md`, coordinate shared files, and merge through a focused pull request.

## Working agreement

- `main` is the stable integration branch. No direct feature pushes to `main`.
- One owner per issue/branch; announce shared-file changes before editing them.
- Start a branch from the latest `main`; keep PRs small and reviewable.
- Do not add real market data, buyer records, provider availability or farmer personal data without a verified source and permission.
- No Supabase schema migration is merged without Prince's coordination and a reviewed RLS policy/test plan.
- Every contributor must make a meaningful frontend, backend/data, and testing/documentation/review contribution over the build, even if those are not their main ownership lanes.

## First six issues

### FARMESS-01 — App shell and farmer route foundation

**Owner:** Mayank · **Priority:** P0 · **Initial branch:** `feat/01-farmer-route-foundation`

**Scope:** Integrate the application shell, navigation, role workspace route boundaries and the end-to-end farmer navigation skeleton. Keep `My Produce` as a collection route distinct from `Add a produce lot`. Coordinate route names with Bhavishya and the backend contract with Prince.

**Acceptance criteria:**
- Farmer routes follow the approved sitemap and navigation labels.
- `/farmer/produce` shows the collection state; `/farmer/produce/new` shows the entry form.
- Navigation and primary CTAs use the correct destination and active state.
- 1440 px, 768 px and 390 px layouts are checked; no critical overflow or lost actions.
- Authentication/persistence gaps are clearly labelled; no fake records are presented as saved data.
- Add a route smoke test and document integration boundaries.

**Shared files to coordinate:** `src/app/**`, `src/components/workspace-layout.tsx`, `src/app/globals.css`.

### FARMESS-02 — Authentication, profile and database security foundation

**Owner:** Prince Kumar · **Priority:** P0 · **Initial branch:** `feat/02-auth-database-foundation`

**Scope:** Supabase project setup, SSR auth clients, profile/role model, first reviewed migrations and RLS foundations. Coordinate the schema change window with Mayank before editing migrations or generated database types.

**Acceptance criteria:**
- Email sign-up, sign-in, sign-out and password recovery work with cookie-based SSR sessions.
- Role assignment is server-controlled; the client cannot grant itself a privileged role.
- First profiles are created/recovered safely after sign-up.
- Each exposed table has RLS enabled with explicit grants/policies.
- Positive and negative access tests cover own-vs-other farmer lots and own notifications.
- Secrets are absent from Git, browser bundles and documentation.

**Shared files to coordinate:** `package.json`, `.env.example`, `supabase/migrations/**`, `src/lib/supabase/**`, generated database types.

### FARMESS-03 — Figma parity and reusable responsive UI

**Owner:** Bhavishya Jain · **Priority:** P0 · **Initial branch:** `feat/03-figma-ui-parity`

**Scope:** Inspect the actual Figma frames and implement the documented farmer overview, produce list/form/review screens and shared UI patterns. The current Figma integration was rate-limited during bootstrap; request frame exports/screenshots if MCP access is still unavailable. Do not claim exact parity without screenshot comparison.

**Acceptance criteria:**
- Desktop Overview, Create Lot and relevant mobile frames are compared against the same Figma viewports.
- Design tokens, typography, field order, content hierarchy, spacing and responsive behaviour match the source.
- Shared buttons, fields, feedback panels and navigation have documented accessible states.
- Validation/loading/empty/error states are considered for the screens owned.
- Keyboard navigation, focus visibility, labels and reduced motion are checked.
- PR includes before/after comparison screenshots and known mismatches.

**Shared files to coordinate:** `src/app/globals.css`, `src/components/ui/**`, layout and farmer page files.

### FARMESS-04 — Market-source validation and market-data adapter

**Owner:** Yash · **Priority:** P0 · **Initial branch:** `feat/04-market-data-provider`

**Scope:** Verify candidate OGD India / AGMARKNET access, fields, source terms, attribution, units and refresh characteristics. Implement a normalized server-side adapter only after access and schema are verified.

**Acceptance criteria:**
- A source-verification note records the exact resource, access method, fields, terms/attribution, units, update granularity and test date.
- `MarketPriceRecord` preserves source name, observation date, retrieval time, unit and value type.
- Malformed values and unsupported units are rejected safely.
- No source-backed values are fabricated; demo fixtures remain explicitly labelled.
- No-data, stale and source-failure states are implemented and tested.
- UI integration uses the agreed market-price contract rather than calling the external API from the browser.

**Shared files to coordinate:** market domain types, any migration, `src/app/api/market-prices/**`, `src/lib/market-data/**`.

### FARMESS-05 — Net-return calculator and comparison contract

**Owner:** Rajan Kumar · **Priority:** P0 · **Initial branch:** `feat/05-net-return-calculator`

**Scope:** Implement pure domain functions for gross sale value, explicit deductions, net total, net per unit, completeness and unit compatibility. Work with Yash on price inputs and Bhavishya on comparison/breakdown UI.

**Acceptance criteria:**
- Calculation logic is independent of React components.
- Money arithmetic uses a decimal-safe representation; stored financial values are not binary floating-point.
- Unknown costs produce an incomplete result; they are never silently treated as zero.
- Unit conversion is explicit and tested; incompatible options cannot be ranked.
- Quality loss is never double-counted.
- Every deduction, assumption/value type and missing-data reason is returned for transparent UI display.
- Unit tests include normal values, invalid quantities, missing costs, unit mismatch and quality-loss edge cases.

**Shared files to coordinate:** calculation types, `src/lib/calculations/**`, `src/features/net-return/**`, snapshots migration if required.

### FARMESS-06 — Buyer, logistics, notification lifecycle and E2E QA

**Owner:** Atharv Singh · **Priority:** P1 for marketplace; P0 notification foundation · **Initial branch:** `feat/06-marketplace-and-notifications`

**Scope:** Define and implement buyer requirements, offer lifecycle, logistics requests/provider response, activity events, persistent notifications and role-focused E2E journeys. Coordinate domain states and migrations with Prince before coding DB changes.

**Acceptance criteria:**
- Buyer-to-farmer offer journey uses explicit quantity/unit/price basis/validity and server-confirmed state transitions.
- Only the farmer who owns a lot can accept or decline its offer; expired offers cannot be accepted.
- Logistics requests remain pending until the assigned provider explicitly responds.
- Sale activity reflects persisted events/evidence; it does not imply Farmess processes payment.
- Notifications are recipient-scoped, persistent, deduplicated and support mark-one/read-all behaviour.
- E2E tests cover a successful journey and cross-user access denial.
- Marketplace lists show honest empty/unavailable states when records do not exist.

**Shared files to coordinate:** lifecycle enums/types, notifications schema, RLS, `src/app/api/**`, buyer/provider UI routes.

## Cross-review rotation

| PR area | Required review focus |
|---|---|
| App shell / integration | Bhavishya for visual structure; Atharv for journey QA |
| Authentication / database | Prince plus Mayank or a non-author reviewer |
| Figma parity / responsive UI | Bhavishya plus one non-UI reviewer |
| Market data / provenance | Yash plus Rajan |
| Net-return calculations | Rajan plus Yash |
| Buyer / logistics / notifications | Atharv plus Prince |

Confirm actual GitHub usernames before adding CODEOWNERS entries or assigning issues. Do not guess handles.

## First integration gate

Before merging the first integrated P0 farmer journey, verify:

1. A user can sign up/sign in and is assigned a server-controlled farmer role.
2. The user can create and review a produce lot with field validation.
3. The lot is persisted and visible only to its owner unless explicitly shared.
4. Market observations carry source/date/unit/freshness information or show an honest unavailable state.
5. Comparison explains every deduction and refuses unsupported ranking when material inputs are missing.
6. Desktop, tablet and mobile navigation remain usable.
7. CI, security/RLS tests and the agreed smoke tests pass.

## Deployment agreement

Connect the private repository to one Vercel project. Enable pull-request previews and automatic production deployments from `main`. Do not add Supabase credentials until Prince provisions and reviews the shared project. Keep service-role/secret keys server-only. A working Vercel build preview is not the same as a complete, production-ready farmer service.
