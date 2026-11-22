# Notification inbox list query boundary

This parser validates pagination inputs for the notification inbox domain. It accepts only a page size and a stable cursor pair.

## Supported query parameters

- `limit`: optional integer from 1 to 50; defaults to 20.
- `beforeCreatedAt`: optional ISO 8601 date-time containing a timezone.
- `beforeId`: optional non-empty cursor record ID, up to 128 characters.

Cursor parameters must be supplied together. The cursor should come from the last item of the previous page.

## Server-owned query decisions

The request must not control:
- Recipient/user ID.
- Role or permission.
- Read/unread state filter.
- Sort direction or ordering.
- Any database table or field selection.

The server derives recipient identity from the verified session, queries only that recipient's rows under RLS, and keeps deterministic newest-first ordering as defined by the inbox domain. Unknown query keys are ignored.

## Integration

Convert URL search parameters into a plain key/value object and pass them to `parseNotificationListQuery`. On success, pass the resulting `limit` and `before` cursor to `listRecipientNotifications`. On failure, return a safe 400 response.

This module validates query shape only; it does not authenticate, access the database or return notification data.
