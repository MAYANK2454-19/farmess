# Sale activity timeline contract

## Delivered in this slice

- Typed append-only milestones for offer acceptance, agreed terms, dispatch,
  weighment, delivery and externally reported payment status.
- Validation for event identifiers, timestamps, evidence references and
  positive weighment quantities.
- Stable chronological timeline ordering with deterministic tie-breakers.
- Explicit labels for disputed milestones.
- Payment status is labelled as externally reported and not verified or
  processed by Farmess.

## Persistence and security boundary

This module is a pure domain helper. It does not create sales, persist events,
authenticate actors or authorize access. The caller must verify the current
session, sale/counterparty permissions and evidence access in trusted
server-side code before reading or writing events.

The database integration should follow the architecture's sales and
trade_events contracts. Keep trade events append-only; corrections should be
recorded as new events or an explicit disputed state rather than silently
rewriting history. Store evidence references only after validating that the
actor may access the referenced object.

Do not interpret a reported payment status as a payment processed by Farmess.
A payment gateway, escrow or financial custody is outside the first-version
scope.

## Test command

    node --experimental-strip-types --test src/features/marketplace/sale-activity.test.ts

## Follow-up integration

- Coordinate sales and trade-events migrations and RLS with the database owner.
- Create trade events only from trusted server-side state transitions.
- Add role-scoped timeline routes and UI empty, disputed and unavailable states.
- Add E2E tests for counterpart access and cross-user denial.
