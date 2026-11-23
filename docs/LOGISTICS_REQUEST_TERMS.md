## Logistics request terms

The `validateLogisticsRequestTerms` helper validates the minimum terms of a transport request before server-side persistence.

It validates positive quantity and supported units, non-empty distinct pickup and delivery areas, valid timestamps, and a future needed-by time after the request time.

This helper does not select a provider, confirm availability, book transport, process payment, authorize a user, or persist a request. Server routes must still enforce authenticated actor ownership/provider assignment and database/RLS rules.
