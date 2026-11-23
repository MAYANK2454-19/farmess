# OGD source quality diagnostics

The OGD India / AGMARKNET adapter now reports how many raw source rows were received, accepted by normalization and rejected, including a reason count for each rejected row.

## Counters

- `received`: raw records returned by the completed paginated source lookup.
- `accepted`: records that passed identity, date and price normalization.
- `rejected`: records withheld from downstream results.
- `rejectionReasons`: counts by rejection category.

The following rejection categories are reported:

- `invalid_record`: the source row is not an object.
- `missing_identity`: commodity, state, district or market is absent.
- `invalid_observation_date`: the source date is missing, malformed or impossible.
- `invalid_price`: a supplied price is malformed, negative or non-numeric.
- `missing_prices`: all three min, max and modal prices are absent.
- `inconsistent_prices`: min/max/modal values contradict one another.

Optional individual price fields remain allowed when at least one valid price is present. Rejected rows are not included in the normalized result or imported into the database.

## API response

The admin market refresh response includes `recordsReceived`, `recordsAccepted`, `recordsRejected` and the full `sourceQuality` report. The ingestion audit's received count reflects raw source rows, while upserted count continues to reflect rows actually stored. Duplicate reconciliation remains active before the database upsert.

These diagnostics are aggregate counters only; they do not persist rejected row payloads or expose API credentials. They do not change freshness classification, source attribution, price units, pagination limits or duplicate reconciliation.

## Verification

```sh
node --experimental-strip-types --test src/lib/market-data/normalize-diagnostics.test.ts
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
```
