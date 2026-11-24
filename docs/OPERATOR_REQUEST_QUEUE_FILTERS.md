# Operator incoming-request queue filters

The operator's Incoming requests workspace provides a focused triage view over requests already scoped to the signed-in provider by the server.

## Queue controls

- **All** shows every request returned by the provider request API.
- **Pending** shows requests awaiting the provider's decision.
- **Accepted** shows requests currently accepted by the provider.
- **Closed** groups declined, cancelled and completed requests; it does not include pending or accepted work.
- Search matches all entered terms across service title/type, status, origin, destination, requested date, quantity/unit and farmer-provided message.
- Sort supports newest-first and oldest-first using the persisted request creation timestamp. Invalid timestamps are kept at the end.
- Counts always describe the complete loaded queue, not just the active filter.
- Clearing search and selecting All restores the full loaded queue.

## Boundaries

Filtering is client-side over the authenticated provider's existing server-scoped response. It does not broaden the API query, expose farmer profile fields, change request state, reserve capacity or claim that a service was fulfilled. Request actions retain their existing server authorization and conditional status checks.
