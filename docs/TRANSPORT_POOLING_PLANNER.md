# Transport pooling planner — isolated feature slice

Branch: `feat/transport-pooling-planner`

## What it does

- Evaluates candidate produce lots against a provider's published transport listing.
- Requires exact pickup/drop-off area compatibility and a pickup date inside the listing's stated window.
- Checks stated crop suitability and refrigerated transport requirements.
- Converts kg, quintal and tonne to a common kg basis before checking capacity.
- Returns accepted lot IDs, rejected lot IDs with human-readable reasons, used capacity, remaining capacity and utilisation.

## What it deliberately does not do

- It does not calculate road distance, infer routes, predict travel time or assume that two differently named areas are connected.
- It does not expose farmer contact details.
- It does not calculate freight rates or allocate money.
- It does not reserve capacity, create a logistics request or confirm a booking.
- A published listing is still only indicative. Unverified listings are labelled verification pending.

## Integration boundary

This slice is isolated under `src/features/logistics/` and does not edit shared CSS, app routes, package scripts, Supabase clients, migrations, generated database types or the marketplace domain files in PR #15.

## Tests

Run with Node 22+:

```sh
node --experimental-strip-types --test src/features/logistics/transport-pooling.test.ts
```
