# Produce lot request boundary

This module is the server-facing parser for an untrusted create-lot request body. It whitelists only the fields in `LotDraftInput` and then delegates semantic validation to the existing `validateLotDraft` function.

## Accepted fields

Required string fields:
- `crop`
- `quantity`
- `unit`
- `location`
- `availableAt`
- `sellBy`

Optional string fields:
- `variety`
- `grade`
- `notes`

Omitted optional fields become empty strings. A field explicitly supplied as null, a number, an array or another non-string value is rejected. Existing domain rules still validate supported units/grades, positive decimal quantity, calendar dates, sell-by ordering and text limits.

## Trust boundary

The parser does not accept, preserve or infer:
- `ownerId` / user ID
- Role or admin flags
- Record ID
- Publication/verification status
- Approval state or server-generated timestamps

Extra fields are ignored and never appear in the validated data. After parsing succeeds, the server route must attach the owner from the verified Supabase session and set any server-controlled lifecycle fields. Never use a user-supplied owner, role or status from the request body.

## Result handling

- `status: valid`: use the whitelisted, trimmed `data`.
- `status: invalid`, `reason: invalid_payload`: the body is not a JSON object.
- `status: invalid`, `reason: invalid_fields`: type-level or existing lot-domain validation failed. The `errors` map is keyed by the relevant form field.

This is an input parsing helper, not a persistence implementation or an authorization boundary. Database ownership and RLS remain required before lots can be saved.
