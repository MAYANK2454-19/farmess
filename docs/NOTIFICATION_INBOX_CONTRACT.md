# Notification inbox foundation

This module implements the pure inbox behaviour for the P0 in-app notification foundation. The marketplace PR supplies validated notification drafts and event-version deduplication; this module supplies recipient-scoped listing and read-state transitions.

## Scope

- List notifications for one recipient, newest first, with stable cursor pagination.
- Compute the recipient's unread count across the entire inbox, not just the current page.
- Mark one unread notification as read.
- Mark all unread notifications as read.
- Return a typed related-record target for supported entity types.

The functions are pure and do not claim that a notification has been persisted. They are intended to be used by a server-side repository/service when the shared Supabase project and schema are ready.

## Security contract

- Pass only the user ID from a verified server-side Supabase session. Never take `recipientUserId` from request JSON, query parameters, local storage or a form.
- Database reads and writes must additionally include the recipient predicate (`recipient_user_id = auth.uid()`) and be protected by RLS.
- A user must not be able to mark another user's notification as read, infer another user's unread count, or retrieve their inbox by changing an ID.
- Generate `readAt` from server time. Do not trust a client-supplied read timestamp.
- The module is defence in depth, not an authentication or authorization boundary.
- Opening a related-record target must perform a fresh permission check on the destination. A notification link is not proof of access.

## Persistence integration still required

After the shared Supabase project and migration window are approved, add a notifications table with at least:

- A generated primary key.
- `recipient_user_id` referencing the authenticated user.
- Event type, title and body.
- Related entity type and related entity ID.
- A stable `dedupe_key`.
- `created_at` and nullable `read_at`.

The database must enforce uniqueness on `(recipient_user_id, dedupe_key)`, index recipient plus creation time for inbox pagination, enable RLS and add explicit SELECT/UPDATE policies. UPDATE policy must have both `USING` and `WITH CHECK`; an appropriate SELECT policy must exist. Browser clients must not be allowed to insert arbitrary notifications. Server-side event handlers should create notifications after a persisted domain state transition.

No migration is included in this PR because the repository's FARMESS-02 owner has no connected shared Supabase project in this workspace and the architecture requires the team to coordinate one migration owner at a time.

## Current boundary

This slice is not end-to-end notification persistence. The notification centre UI, authenticated route handlers, database table/RLS policies, unique constraint, and database-level cross-user tests remain integration work.
