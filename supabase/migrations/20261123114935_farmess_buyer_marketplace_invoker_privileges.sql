-- Make the buyer projection use the caller's permissions and the table's RLS.
alter view public.buyer_marketplace_lots
  set (security_invoker = true, security_barrier = true);

-- The public buyer projection does not need farmer IDs, private notes or updated_at.
-- Keep only columns required by the view available to authenticated users.
revoke select on table public.produce_lots from anon,authenticated;
revoke select (owner_id,notes,updated_at) on public.produce_lots from anon,authenticated;
grant select (
  id,crop,variety,grade,quantity,unit,approximate_area,
  available_from,sell_by,status,created_at
) on public.produce_lots to authenticated;

-- produce_lots_select_visible is the RLS boundary: owners see their own rows;
-- buyers can see published rows only. The view deliberately omits owner_id.
-- Keep offer creation as a narrowly-scoped SECURITY DEFINER transaction so the
-- farmer ID is resolved inside the database and never disclosed to the buyer.
alter function public.create_buyer_offer(uuid,numeric,text,bigint,timestamptz,text) security definer;
revoke all on function public.create_buyer_offer(uuid,numeric,text,bigint,timestamptz,text) from public,anon;
grant execute on function public.create_buyer_offer(uuid,numeric,text,bigint,timestamptz,text) to authenticated;

comment on view public.buyer_marketplace_lots is
  'Security-invoker buyer-only published lot projection. Base-table RLS applies; owner IDs, private notes and unlisted profile fields are not exposed.';
comment on function public.create_buyer_offer(uuid,numeric,text,bigint,timestamptz,text) is
  'Guarded transactional SECURITY DEFINER RPC: verifies auth.uid and trusted buyer app_metadata, locks the published lot, validates quantity/unit/expiry, derives farmer ownership internally, and has no PUBLIC/anon execute grant.';

notify pgrst,'reload schema';
