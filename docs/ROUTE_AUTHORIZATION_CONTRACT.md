# Server-side route authorization contract

This module composes the existing FARMESS role-to-permission matrix with a record-level relationship check. It gives Next.js route handlers and server actions one consistent allow/deny decision shape.

## Usage

A route handler first obtains the current user from the verified server-side Supabase session. It then derives the Farmess role from trusted server-side profile/app metadata and passes that verified actor to `authorizeFarmessRequest`.

The actor must never come from:

- Request JSON or form fields.
- Query parameters or URL path values.
- Local storage, cookies written by the client, or React state.
- Supabase `user_metadata` or any client-editable role field.

Example pattern (pseudocode):

```ts
const sessionUser = await getVerifiedServerSessionUser();
const actor = sessionUser ? toFarmessActor(sessionUser) : null;

const decision = authorizeFarmessRequest(actor, "lot:update_own", {
  kind: "owned",
  ownerId: lot.owner_id,
});

if (!decision.allowed) {
  return Response.json({ error: decision.reason }, { status: decision.statusCode });
}
```

The caller must still query persisted data with the current user scope and handle database errors.

## Supported record rules

| Rule             | Required condition                                                                                                    |
| ---------------- | --------------------------------------------------------------------------------------------------------------------- |
| `owned`          | Actor user ID exactly matches persisted owner ID.                                                                     |
| `assigned`       | Actor user ID exactly matches persisted assignee/provider ID.                                                         |
| `participant`    | Actor user ID appears in the persisted participant list.                                                              |
| `farmer_details` | Farmer is the viewer, or the viewer is a buyer/operator and farmer consent plus workflow authorization are both true. |

Every rule is evaluated only after the actor is authenticated and the requested role permission is granted. Admin does not bypass the matrix.

## Decisions

- `allowed: true`: role permission and optional relationship rule both passed.
- HTTP 401 `unauthenticated`: there is no actor from a verified session.
- HTTP 401 `invalid_actor`: actor identity or role is malformed.
- HTTP 403 `permission_denied`: the role lacks the requested capability.
- HTTP 403 record reasons: ownership, assignment, participation, consent/workflow or malformed relationship rule did not pass.

The reason is intended for server logs and structured route handling. Do not expose private record data while generating a denial response.

## Security boundary

This helper is defence in depth, not an authentication provider and not a substitute for Postgres RLS. Every exposed table must still have reviewed grants and RLS policies. The database should enforce recipient/owner/assignee/participant predicates against `auth.uid()`. An allow decision must not be reused for a different record or across requests.

No Supabase client or secret is used by this module. No migrations are included because the shared Supabase project and migration schedule must be coordinated by the FARMESS-02 owner.
