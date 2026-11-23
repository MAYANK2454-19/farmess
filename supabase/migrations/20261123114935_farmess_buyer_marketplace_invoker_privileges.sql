alter view public.buyer_marketplace_lots set (security_invoker = true);

revoke select on table public.produce_lots from anon,authenticated;
grant select (
  id,owner_id,crop,variety,grade,quantity,unit,approximate_area,
  available_from,sell_by,status,created_at
) on public.produce_lots to authenticated;

drop policy if exists produce_lots_select_published_for_buyers on public.produce_lots;
create policy produce_lots_select_published_for_buyers
  on public.produce_lots
  for select to authenticated
  using (
    status='published'
    and coalesce((select auth.jwt() -> 'app_metadata' ->> 'farmess_role'),'')='buyer'
  );

alter function public.create_buyer_offer(uuid,numeric,text,bigint,timestamptz,text) security invoker;

comment on view public.buyer_marketplace_lots is
  'Security-invoker buyer-only published lot summary. RLS applies to underlying rows; farmer notes and unlisted columns are not granted to authenticated users.';
comment on function public.create_buyer_offer(uuid,numeric,text,bigint,timestamptz,text) is
  'Security-invoker function. Buyer identity derives from auth.uid; published lot owner is read under buyer RLS; offers insert is protected by buyer policies and the lot-owner foreign key.';
notify pgrst,'reload schema';
