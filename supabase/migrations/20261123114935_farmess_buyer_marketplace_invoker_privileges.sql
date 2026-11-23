-- Expose a safe buyer projection without granting buyers access to farmer rows.
-- The private projection contains no owner_id, notes, phone number or private profile field.
create table private.marketplace_lot_summaries as
select
  id,crop,variety,grade,quantity,unit,approximate_area,
  available_from,sell_by,created_at
from public.produce_lots
where false;

alter table private.marketplace_lot_summaries
  add constraint marketplace_lot_summaries_pkey primary key (id);
alter table private.marketplace_lot_summaries
  add constraint marketplace_lot_summaries_lot_fk
  foreign key (id) references public.produce_lots(id) on delete cascade;

alter table private.marketplace_lot_summaries enable row level security;
revoke all on private.marketplace_lot_summaries from public,anon,authenticated;
grant usage on schema private to authenticated;
grant select on private.marketplace_lot_summaries to authenticated;
grant all on private.marketplace_lot_summaries to service_role;

create policy marketplace_lot_summaries_buyer_select
  on private.marketplace_lot_summaries
  for select to authenticated
  using (
    coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'farmess_role'),'')='buyer'
  );

-- The public produce_lots table remains visible only to its farmer owner.
-- Buyers use the separate, column-limited projection below.
drop policy if exists produce_lots_select_visible on public.produce_lots;
drop policy if exists produce_lots_select_own on public.produce_lots;
create policy produce_lots_select_own
  on public.produce_lots
  for select to authenticated
  using (
    (select auth.uid())=owner_id
    and coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'farmess_role'),'')='farmer'
  );

create or replace function private.sync_marketplace_lot_summary()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op='DELETE' then
    delete from private.marketplace_lot_summaries where id=old.id;
    return old;
  end if;

  if new.status='published' then
    insert into private.marketplace_lot_summaries (
      id,crop,variety,grade,quantity,unit,approximate_area,
      available_from,sell_by,created_at
    ) values (
      new.id,new.crop,new.variety,new.grade,new.quantity,new.unit,new.approximate_area,
      new.available_from,new.sell_by,new.created_at
    )
    on conflict (id) do update set
      crop=excluded.crop,
      variety=excluded.variety,
      grade=excluded.grade,
      quantity=excluded.quantity,
      unit=excluded.unit,
      approximate_area=excluded.approximate_area,
      available_from=excluded.available_from,
      sell_by=excluded.sell_by,
      created_at=excluded.created_at;
  else
    delete from private.marketplace_lot_summaries where id=new.id;
  end if;

  return new;
end;
$$;

revoke all on function private.sync_marketplace_lot_summary() from public,anon,authenticated;
drop trigger if exists produce_lot_marketplace_summary_sync on public.produce_lots;
create trigger produce_lot_marketplace_summary_sync
  after insert or update of crop,variety,grade,quantity,unit,approximate_area,available_from,sell_by,status
  or delete on public.produce_lots
  for each row execute function private.sync_marketplace_lot_summary();

insert into private.marketplace_lot_summaries (
  id,crop,variety,grade,quantity,unit,approximate_area,
  available_from,sell_by,created_at
)
select
  id,crop,variety,grade,quantity,unit,approximate_area,
  available_from,sell_by,created_at
from public.produce_lots
where status='published'
on conflict (id) do update set
  crop=excluded.crop,
  variety=excluded.variety,
  grade=excluded.grade,
  quantity=excluded.quantity,
  unit=excluded.unit,
  approximate_area=excluded.approximate_area,
  available_from=excluded.available_from,
  sell_by=excluded.sell_by,
  created_at=excluded.created_at;

create or replace view public.buyer_marketplace_lots
with (security_barrier=true,security_invoker=true)
as
select
  id,crop,variety,grade,quantity,unit,approximate_area,
  available_from,sell_by,created_at
from private.marketplace_lot_summaries
where coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'farmess_role'),'')='buyer';

revoke all on public.buyer_marketplace_lots from public,anon;
grant select on public.buyer_marketplace_lots to authenticated;

comment on table private.marketplace_lot_summaries is
  'Private, synchronized projection for buyer marketplace reads. Contains no farmer ID or private lot notes.';
comment on view public.buyer_marketplace_lots is
  'Security-invoker buyer-only published lot projection. Underlying private-table RLS applies; owner IDs and private lot fields are not exposed.';
comment on function private.sync_marketplace_lot_summary() is
  'Maintains the safe buyer projection when farmer-owned lots are published, edited or removed.';

-- Keep the narrowly scoped offer RPC: it resolves the farmer ID internally and
-- performs role checks, a row lock and quantity/unit/expiry validation.
alter function public.create_buyer_offer(uuid,numeric,text,bigint,timestamptz,text) security definer;
revoke all on function public.create_buyer_offer(uuid,numeric,text,bigint,timestamptz,text) from public,anon;
grant execute on function public.create_buyer_offer(uuid,numeric,text,bigint,timestamptz,text) to authenticated;
comment on function public.create_buyer_offer(uuid,numeric,text,bigint,timestamptz,text) is
  'Guarded transactional SECURITY DEFINER RPC: checks auth.uid and trusted buyer app_metadata, locks the published lot, validates quantity/unit/expiry, and derives farmer ownership internally; unavailable to PUBLIC and anon.';

notify pgrst,'reload schema';
