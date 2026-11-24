# Admin provider-listing verification

Open `/admin/providers` from an authenticated Farmess admin account.

## Review flow

- New operator listings enter the queue as `unverified`.
- Admins can set `contact_verified`, `document_verified`, `platform_verified`, return a listing to `unverified`, or set `suspended`.
- Every change requires a 20–500 character review note.
- The database RPC checks trusted `app_metadata.farmess_role = admin` and the matching `profiles.role = admin`, locks the listing row, rejects no-op decisions, updates the state and inserts an audit event in one transaction.
- The operator cannot write the verification field. Existing trigger protections remain in place.
- The audit history is append-only to authenticated clients; only admins can read it. The listing foreign key uses `ON DELETE RESTRICT`, so a reviewed listing cannot be deleted and erase its audit trail. There is no browser-side service-role key or direct table write.

## Review standard

A verification label is an administrative record, not a guarantee of quality, capacity, insurance, availability or future performance. Verify evidence through the team's approved external process; do not infer that contact or documents were checked merely because a listing exists. Keep review notes factual and avoid storing sensitive identity-document numbers or copies.

## Data boundary

The queue contains service listing information and operator UUIDs, not phone numbers, email addresses, identity documents or other profile contact details. The exact database role guard and RLS policies are enforced independently of the page UI.
