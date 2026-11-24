# Farmer service-request cancellation

Farmers can cancel their own transport or storage request while it is pending or accepted.

## Behaviour

The cancellation action is available in the farmer workspace under Transport and storage → My requests.

- The farmer confirms cancellation from the My requests list.
- The server accepts only an exact request ID and the `cancel` action.
- The update is scoped to the authenticated requester and current `pending` or `accepted` state.
- A successful cancellation changes the request status to `cancelled`.
- Existing database row-level security and the service-request event trigger enforce participant access and notify the provider.
- Declined, already-cancelled and completed requests cannot be cancelled through this action.
- Operators continue to accept or decline pending requests through their existing provider workflow.

Cancellation does not delete the request, erase its history or guarantee that any offline arrangement has been reversed. The farmer should contact the provider directly if transport or storage has already been arranged.
