# FARMESS-06 implementation notes

Branch: `feat/06-marketplace-and-notifications`

## Delivered in this slice

- Deterministic, explainable lot-to-requirement matching across crop, optional variety/grade, normalized quantity units, area and date window.
- Pure offer transition rules for farmer accept/decline, buyer withdrawal and expiry.
- Pure logistics request transition rules for assigned-provider response, more-information, farmer resubmission and cancellation.
- Notification draft validation, recipient identity, related-record references and stable event-version dedupe keys.
- Unit tests for positive and negative ownership checks, expiry, partial matches, quantity-unit conversion, provider assignment and notification deduplication/privacy checks.

## Deliberate integration boundary

The current `main` branch has no Supabase client modules, migrations, auth helpers or database test harness. Marketplace and notification pages are still placeholders. This slice therefore does **not** claim persistent buyer requirements, offers, logistics requests, sale activity, notifications, RLS, or authenticated API routes.

Before wiring persistence, coordinate with Prince on the profiles/roles, buyer_requirements, buyer_offers, logistics_listings, logistics_requests, trade_events and notifications migrations and their RLS policies. The database must enforce notification uniqueness on recipient plus dedupe key. Mutations must run in trusted server code and re-check the current authenticated actor and record ownership; these pure functions are not an authorisation boundary.

## Test command

Run with Node 22+:

```sh
node --experimental-strip-types --test src/features/marketplace/domain.test.ts src/features/marketplace/notifications.test.ts
```

The repository's existing `npm test` script has not yet been extended because the open FARMESS-04 PR is concurrently changing the shared package scripts. Add both marketplace test files to the shared test command when integrating that PR.

## Remaining acceptance work

- Database migrations and RLS positive/negative tests.
- Authenticated API routes and transactional state changes.
- Buyer requirements, offer, logistics, activity and notification UI.
- E2E happy path and cross-user denial journeys.
- Run lint, typecheck, full tests and production build after the shared database foundation is available.
