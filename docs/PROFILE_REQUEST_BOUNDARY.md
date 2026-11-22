# Profile update request boundary

This module parses an untrusted profile PATCH body into a strict whitelist of editable profile properties. It does not authenticate the viewer, write to Supabase or make a disclosure decision.

## Accepted fields

- `displayName`: optional, trimmed non-empty string, up to 80 characters.
- `phoneNumber`: optional international E.164 number. Common spaces, parentheses and hyphens are normalized; an empty string explicitly clears the optional value.
- `marketArea`: optional locality/market-area string, up to 160 characters. An empty string clears the value. Exact coordinate pairs and `geo:` values are rejected.
- `consents`: optional partial object containing boolean values for:
  - `approximateLocationSharing`
  - `exactLocationDisclosure`
  - `buyerContactDisclosure`
  - `providerContactDisclosure`

A consent PATCH changes only the fields included in the request. Explicit `false` revokes that consent; omitted flags remain unchanged.

## Never accepted from the client

- User ID, owner ID or profile ID.
- Farmess role, admin flag or account status.
- Email verification, moderation/identity verification status.
- Created/updated timestamps or audit metadata.
- Exact GPS coordinates as a market area.

Unknown keys are ignored and never copied to the parsed result. At least one supported field must be present.

## Server-side integration requirements

1. Obtain the viewer from a verified server-side authentication session.
2. Parse the request with `parseProfileUpdateRequest`.
3. Derive the target user ID from the verified session, never from the body.
4. Persist only the returned whitelist, with database ownership checks and RLS.
5. Record consent changes with server timestamps and an audit history when persistence is implemented.
6. Apply `privacy-policy.ts` on every disclosure. A profile update request is not proof that the viewer is entitled to reveal the data.

This module deliberately does not update the profile UI, routes, database schema or generated types. Persistence and authenticated route integration require the shared Supabase project and coordinated schema approval.
