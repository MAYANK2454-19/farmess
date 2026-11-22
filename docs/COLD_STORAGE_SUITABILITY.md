# Cold Storage Discovery & Suitability Planner

## Scope

This is a pure, deterministic planning module for the Farmess P1 Storage Discovery workflow. It compares an explicitly described storage listing with candidate produce lots using:

- Facility area and crop suitability.
- Published status and availability window covering the full requested storage period.
- Lot quantity and stated facility capacity (kg, quintal or tonne).
- Refrigeration requirement and an explicitly supplied temperature range when the lot provides one.
- An optional rate with an explicit per-kg/per-quintal/per-tonne per-day basis.

## Cost and truthfulness rules

- Rates are stored as integer paise and estimates are returned as integer paise.
- A missing rate returns `estimatedCostPaise: null` and `costValueType: unavailable`; it is never treated as free storage.
- A rate retains its declared value type: quoted, indicative or demo.
- A storage listing is not a booking. The planner always returns `bookingStatus: not_booked`.
- A provider listing that is not verified is labelled `verification_pending`. Even a verified listing remains indicative until a provider confirms a request.
- Temperature suitability is checked only against explicit lot and facility temperature ranges. The planner does not infer crop-specific storage temperatures.

## Deliberate limitations

- Area matching is exact text matching after whitespace/case normalisation; no geocoding, distance or route inference.
- No live provider inventory, booking, payment, cold-room telemetry or freshness/quality guarantee is integrated.
- No database, API route, UI, authentication or RLS policy is added. Those require agreement with the storage/provider owner and Prince before shared schema changes.
- The planner is decision support only; a provider must explicitly confirm availability and terms.

A capacity calculation is a screening result for the supplied candidate set only. It does not lock capacity, account for concurrent requests, or imply that any lot has been accepted by a provider.

## Tests

Run directly with Node.js 22+:

```sh
node --experimental-strip-types --test src/features/logistics/cold-storage.test.ts
```

The repository's current `npm test` script runs only the net-realisation calculator test. This feature's test is documented as a direct command rather than modifying shared `package.json`.
