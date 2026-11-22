# FARMESS authorisation contract

This document records the first backend/platform slice for FARMESS-02. It is a shared application contract and a set of testable guard helpers; it is **not** a replacement for Supabase Auth, server-side authorisation, or Postgres Row Level Security (RLS).

## Trusted role source

- Read `farmess_role` only from Supabase `app_metadata` on a verified server-side user/claims result.
- Never derive a role or permission from `user_metadata`, a form field, a URL parameter, local storage, or a browser-provided object.
- Role provisioning must happen in trusted server-side code. A client must never be able to write `admin` into its own metadata.
- The role helper does not verify a JWT. Callers must supply verified claims/user data and must not use it as a parser for request payloads.
- Admin/reviewer access is not a wildcard. Any support access must be separately authorised for a specific case and audited.

## Application permission matrix

| Capability                                      | Farmer | Buyer | Operator | Admin             |
| ----------------------------------------------- | ------ | ----- | -------- | ----------------- |
| Create and manage own produce lots              | Yes    | No    | No       | No blanket access |
| Respond to offers on own lots                   | Yes    | No    | No       | No blanket access |
| Create/manage own buyer requirements and offers | No     | Yes   | No       | No blanket access |
| Read matched lot summaries                      | No     | Yes   | No       | No blanket access |
| Create/manage own service listings              | No     | No    | Yes      | No blanket access |
| Respond to assigned service requests            | No     | No    | Yes      | No blanket access |
| Read/mark own notifications                     | Yes    | Yes   | Yes      | No blanket access |
| Read participating sale activity                | Yes    | Yes   | No       | No blanket access |
| Read assigned service activity                  | No     | No    | Yes      | No blanket access |

These helpers express role-level capabilities. Every record operation must additionally check ownership, assignment, participation, or an explicitly authorised workflow.

## Record-level and privacy rules

- A user can access an owned record only when their verified user ID matches the record's owner ID.
- A notification is readable only when `recipient_user_id` matches the verified user ID.
- A sale event is readable only by an explicitly listed participant (or an operator assigned to the relevant service activity).
- Exact farmer contact details and location remain private by default. A buyer/operator disclosure requires farmer consent and a workflow that actually needs the details. A farmer can view their own details.
- Creating a notification is server-side event handling, not a client permission. Generate it from a persisted state transition and scope it to the authorised recipient.

## Required database enforcement before real data is enabled

The code in `src/lib/auth/authorization.ts` is defence in depth only. It does not protect a table from direct Data API access. Before exposing records:

1. Provision the Supabase project and coordinate the schema with the product/integration lead.
2. Add reviewed migrations for profiles, role assignment and the first data tables. Create migrations using the Supabase CLI workflow; do not invent or manually number migration files.
3. Enable RLS on every table in an exposed schema and grant only the operations each Postgres role needs.
4. Add explicit own-record policies for profiles, lots and notifications; add relationship-aware policies for matched lots, offers, service requests and sale activity.
5. For UPDATE policies, add both `USING` and `WITH CHECK`, and ensure an appropriate SELECT policy exists.
6. Keep privileged service/secret keys server-only. Never place them in a `NEXT_PUBLIC_*` variable or commit them.
7. Add database-level positive and negative tests for farmer A versus farmer B, buyer visibility, assigned providers and notification recipients.

## Remaining FARMESS-02 integration work

This branch intentionally does not claim that the complete authentication feature is done. The repository currently has no Supabase client dependency or connected Supabase project available to this workspace. The following work remains before the end-to-end issue acceptance criteria can be checked:

- Install and pin the verified Supabase SSR/client packages and update the lockfile.
- Add cookie-aware server/browser clients and a Next.js session-refresh proxy.
- Implement sign-up, sign-in, sign-out and password recovery.
- Provision/recover profiles and assign roles only through trusted server-side code.
- Add reviewed SQL migrations and RLS policies, then verify them against a real Supabase project.
- Add integration tests for sessions and cross-user database access.

Do not mark FARMESS-02 complete until those checks pass.
