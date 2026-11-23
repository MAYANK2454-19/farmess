# M6 Marketplace Lifecycle QA

## Purpose

This suite checks the pure domain contracts used across the M6 buyer-offer, logistics-response, notification-draft and sale-activity workflows. It gives one cross-module journey test in addition to the focused unit tests.

## Covered scenarios

- A non-owning farmer cannot accept another farmer's offer.
- An offer can be accepted by its owning farmer before expiry; an expired offer cannot be accepted.
- The sale timeline is scoped to the requested sale and sorted by occurrence time.
- Disputed weighment is visibly labelled, and reported payment is never described as verified or processed by Farmess.
- A logistics request remains pending until the assigned provider responds.
- Only the assigned provider can respond, and only the requesting farmer can resubmit after an information request.
- Notification drafts target the intended recipient and related record.

## Run

```sh
npm test
```

The repository test runner discovers every `src/**/*.test.ts` file. To run only this journey suite:

```sh
node --experimental-strip-types --test src/features/marketplace/lifecycle-journey.test.ts
```

## Important boundary

These are domain-level integration tests, not browser E2E tests. They do not exercise a running Next.js app, Supabase persistence, database RLS, authenticated API routes, real notification delivery or two real user sessions. The FARMESS-06 E2E acceptance criterion remains open until those server/database/UI journeys can be exercised with the authentication and schema foundation owned by M2.
