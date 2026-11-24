# Buyer offer history filters

## Scope

The buyer's existing `/buyer/offers` page now supports local filtering and sorting over the buyer-scoped offers returned by the existing authenticated `GET /api/marketplace` endpoint. The existing offer-withdrawal action is preserved.

## Behaviour

- Status tabs: All, Pending, Accepted, Declined, Withdrawn and Expired.
- Expired is a presentation state for a persisted pending offer whose server-provided `is_expired` flag is true. It does not mutate the stored status.
- Counts are calculated from the complete returned history, not the currently filtered subset.
- Multi-term search covers offer terms, quantity, unit, quoted price (paise or rupees per quintal), validity and sent timestamps.
- Every search term must match; search is case-insensitive.
- Newest-first and oldest-first sorting use persisted `created_at` timestamps. Invalid timestamps remain last and ties preserve response order.
- Withdraw is available only for pending, non-expired offers and continues through the existing authenticated PATCH endpoint.
- Clear filters resets status, search and sorting.

## Security and integration

- No new API endpoint, query parameter or database query is introduced.
- Filtering operates only on the existing buyer-scoped `GET /api/marketplace` offer response.
- No farmer identity, contact information or private lot data is added to the buyer response.
- The server remains responsible for authorization and offer withdrawal state transitions.
- No database migration, RLS change or dependency change is required.

## Verification

The focused unit tests cover effective expiry status, full-history counts, status filtering, multi-term search, validity-date search, sorting, invalid timestamps and input immutability. Repository CI additionally runs Prettier, ESLint, TypeScript, all unit tests and the production build.
