# Farmer privacy disclosure policy

This module is the purpose-specific policy layer for sharing farmer information with buyers and logistics operators. It complements the general record-level authorization helper; it does not replace role permissions, authentication or database RLS.

## Separate consent flags

| Data category            | Consent flag                 |
| ------------------------ | ---------------------------- |
| Approximate location     | `approximateLocationSharing` |
| Exact location           | `exactLocationDisclosure`    |
| Buyer contact details    | `buyerContactDisclosure`     |
| Provider contact details | `providerContactDisclosure`  |

All consent defaults are `false`. Granting one permission does not grant the others. Revoking a preference should update persisted consent state and be checked on every new disclosure.

## Permitted workflow matrix

| Viewer   | Data category        | Required workflow          | Consent              |
| -------- | -------------------- | -------------------------- | -------------------- |
| Buyer    | Approximate location | Market matching            | Approximate location |
| Operator | Approximate location | Assigned logistics request | Approximate location |
| Buyer    | Contact details      | Accepted offer             | Buyer contact        |
| Operator | Contact details      | Assigned logistics request | Provider contact     |
| Buyer    | Exact location       | Accepted offer             | Exact location       |
| Operator | Exact location       | Assigned logistics request | Exact location       |

A farmer can access their own data. Other roles cannot bypass workflow and consent requirements. Admin/reviewer roles receive no wildcard disclosure permission from this policy.

## Server-side requirements

- Load the farmer's current consent preferences from trusted persistence, not from the viewer's request.
- Verify the viewer identity and role from the server-side session.
- Verify workflow state from persisted records (for example, an accepted offer or a request assigned to the operator).
- Call this policy for the exact data category being returned.
- Do not expose exact location in public profiles, general matching results or market explorer responses.
- Re-check access on each request; a previous allow decision or notification link is not ongoing consent.

## Integration boundary

This module is pure policy logic. The profile UI, consent persistence, audit trail, Supabase schema/RLS, and authenticated route integration remain separate tasks. No profile page, database migration, API route or generated database type is modified by this PR.
