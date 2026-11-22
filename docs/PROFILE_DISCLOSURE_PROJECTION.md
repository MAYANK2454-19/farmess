# Farmer profile disclosure projection contract

This module constructs a new, minimal profile view for a specific verified viewer and workflow. It applies the existing purpose-specific privacy policy independently to approximate location, contact details and exact location.

## Projection rules

- Display name is returned as the profile's basic public label.
- Approximate locality is returned only when `approximate_location` policy allows it.
- Phone contact is returned only when `contact_details` policy allows it.
- Exact latitude/longitude are returned only when `exact_location` policy allows it.
- Every private field is otherwise set to `null`.
- Consent flags, raw user IDs and the source profile object are never included in the projected view.
- The farmer may view their own information.

## Server-side trust requirements

The caller must:

1. Obtain viewer ID and role from a verified server-side session.
2. Load the target farmer's profile and consent preferences from trusted persistence.
3. Determine the active workflow from persisted state (matching, accepted offer or assigned logistics).
4. Pass those values to the projection builder.
5. Return only the projection's `view` to the client; do not serialize the original profile.
6. Re-run the projection for each request so that a revoked consent takes effect immediately.

A notification link, a client-supplied workflow string or a previously allowed request is not evidence of current access. The server must verify workflow state before calling this module.

## Validation and failure behaviour

Malformed profile records, identities, workflows and impossible coordinates produce an invalid result with no view. The disclosure policy fails closed for missing or malformed consent flags. Missing consent preferences are treated as opt-out for external viewers.

## Integration boundary

This is a pure response-projection module. It does not add routes, storage, database changes or UI changes. Supabase RLS and server-side authorization must still protect the underlying record query.
