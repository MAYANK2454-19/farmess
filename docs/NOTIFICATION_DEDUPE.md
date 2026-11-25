# Notification deduplication contract

buildNotificationDedupeKey provides a deterministic, recipient-scoped identity for a notification event.

## Contract

The key is derived from:

- recipient user ID
- event type
- optional related entity type
- optional related entity ID

The related entity fields must be supplied together. Components are URI-encoded before joining, so separator characters inside identifiers cannot create ambiguous keys.

## Persistence boundary

The helper is deliberately pure. It does not authorize a recipient, fetch records, or insert/update notifications.

When the notification persistence layer is implemented, it should use this key as a uniqueness/idempotency boundary so retries of the same event do not create duplicate inbox records. Database/RLS policy must still enforce recipient ownership.

## Examples

- offer.created for recipient A and offer.created for recipient B are different notifications.
- offer.created and offer.accepted for the same offer are different events.
- Two retries for the same recipient, event and related record produce the same key.
