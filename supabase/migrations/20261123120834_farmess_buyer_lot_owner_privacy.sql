-- Do not grant buyers direct access to farmer ownership identifiers.
-- The guarded offer RPC can resolve the owner internally without exposing owner_id.
revoke select (owner_id) on table public.produce_lots from anon,authenticated;

-- Keep this narrow RPC as the only buyer path that needs to resolve the farmer ID.
-- Its body validates the trusted buyer app_metadata role, lot publication state,
-- units, quantity, expiry, and prevents self-offers. search_path remains empty
-- and PUBLIC/anon cannot execute it.
alter function public.create_buyer_offer(uuid,numeric,text,bigint,timestamptz,text)
  security definer;
alter function public.create_buyer_offer(uuid,numeric,text,bigint,timestamptz,text)
  set search_path = '';
revoke all on function public.create_buyer_offer(uuid,numeric,text,bigint,timestamptz,text)
  from public,anon;
grant execute on function public.create_buyer_offer(uuid,numeric,text,bigint,timestamptz,text)
  to authenticated;

comment on column public.produce_lots.owner_id is
  'Private farmer ownership key. Not selectable by anon/authenticated clients; ownership is enforced through RLS and server-side flows.';
comment on function public.create_buyer_offer(uuid,numeric,text,bigint,timestamptz,text) is
  'Guarded SECURITY DEFINER RPC for authenticated buyers only. Resolves the lot owner internally; validates trusted buyer role, published status, quantity, unit and expiry; no PUBLIC/anon execute grant; search_path is empty.';

notify pgrst,'reload schema';
