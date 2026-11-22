# Notification read request boundary

This parser accepts only the two read actions supported by the notification inbox domain:

- `mark_one_read`: requires one non-empty `notificationId`.
- `mark_all_read`: does not require or use an individual notification ID.

## Client-supplied fields

The client may select the action and, for mark-one, identify which notification it is asking to mark as read. All other input fields are ignored.

In particular, the client must not control:
- Recipient/user ID.
- Read timestamp.
- User role or permission.
- Notification ownership.
- Database update result.

The server derives the recipient from the verified session, applies the recipient predicate/RLS policy and generates `readAt` from server time. The notification ID is not proof of access.

## Route integration pattern

1. Authenticate the request using the server-side session.
2. Parse the body using `parseNotificationReadRequest`.
3. Use the session's user ID as the recipient filter, never a body/query-supplied ID.
4. For `mark_one_read`, update only the row matching both notification ID and recipient.
5. For `mark_all_read`, update only unread rows belonging to the session recipient.
6. Generate the timestamp on the server and return a non-enumerating result where appropriate.

Database RLS and server-side event/recipient checks remain mandatory. This module validates the request shape only; it does not authenticate, persist data or expose a route.
