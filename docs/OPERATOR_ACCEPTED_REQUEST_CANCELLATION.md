# Operator cancellation of accepted service requests

An operator may cancel an accepted transport or storage request when they can no longer fulfil it.

## Behaviour and safeguards

- Cancellation is available only for requests in the `accepted` state.
- The operator confirms the action in the Incoming requests workspace.
- The API accepts only the request ID and the `cancel` action.
- A narrowly scoped database RPC derives the operator from the verified Supabase JWT and updates only a request assigned to that operator while its current state is `accepted`.
- The update changes the request to `cancelled`; the existing service-request status-change trigger remains responsible for the normal event/notification.
- Pending requests must still be accepted or declined. Declined, cancelled and completed requests cannot be cancelled again.
- The request and its history are retained. Cancellation does not prove that an offline arrangement has been reversed; the operator should contact the farmer directly when fulfilment was already arranged.

The migration is versioned but must be applied through the team's approved Supabase migration process before this action is available in the connected database. No live database migration is applied by this PR.
