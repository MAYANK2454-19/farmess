# Farmer buyer-offer inbox filters

## Scope

The farmer's existing `/farmer/offers` inbox now supports local filtering and sorting over the authenticated API response. It does not change offer creation, acceptance, decline, expiry or withdrawal behaviour.

## Behaviour

- Status tabs: All, Pending, Accepted, Declined, Withdrawn and Expired.
- Expired is a presentation state for a persisted pending offer whose server-provided `is_expired` flag is true. It does not mutate the stored status.
- Counts are calculated from the full response, not the currently filtered subset.
- Multi-term search covers crop, variety, offer terms, quantity, unit and quoted price in paise or rupees per quintal. Every search term must match.
- Newest-first and oldest-first sorting use the persisted `created_at` value. Invalid timestamps remain last and ties preserve input order.
- Clear filters resets status, search and sorting.

## Security and integration

- No additional endpoint or query parameter is introduced.
- Filtering operates only on `GET /api/offers` results, which remain scoped by the existing authenticated farmer API.
- No buyer identity or private profile fields are added to the response.
- Offer actions still call the existing server-validated PATCH endpoint. Client-side filters do not grant or change permissions.
- No database migration, RLS change or dependency is required.

## Verification

The focused test file covers effective expiry status, full-inbox counts, status filtering, multi-term search, sorting, invalid timestamps and input immutability. The repository CI additionally runs Prettier, ESLint, TypeScript, all unit tests and the production build.
