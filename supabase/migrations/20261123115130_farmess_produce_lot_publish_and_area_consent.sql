alter table public.produce_lots
  add column if not exists buyer_market_area varchar(160),
  add column if not exists published_at timestamptz;

revoke insert (status,buyer_market_area,published_at) on public.produce_lots from authenticated;

create or replace function private.guard_produce_lot_publication()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_share_area boolean;
begin
  if auth.uid() is not null
     and coalesce(auth.jwt() -> 'app_metadata' ->> 'farmess_role','')='farmer'
  then
    if tg_op='INSERT' then
      if new.owner_id is distinct from auth.uid() then
        raise exception 'A farmer can only create their own produce lot.';
      end if;
      new.status := 'draft';
      new.published_at := null;
      new.buyer_market_area := null;
    elsif old.status is distinct from new.status then
      if not (
        (old.status='draft' and new.status in ('published','withdrawn'))
        or (old.status='published' and new.status='withdrawn')
      ) then
        raise exception 'This produce lot status transition is not allowed.';
      end if;
    end if;

    if new.status='published' then
      if new.quantity<=0
         or new.available_from is null
         or new.sell_by is null
         or new.sell_by<new.available_from
         or nullif(trim(new.crop),'') is null
      then
        raise exception 'Complete the crop, positive quantity and valid availability dates before publishing.';
      end if;

      select coalesce(profile.approximate_location_sharing,false)
      into v_share_area
      from public.profiles profile
      where profile.id=new.owner_id;

      if coalesce(v_share_area,false) then
        new.buyer_market_area := nullif(trim(new.approximate_area),'');
      else
        new.buyer_market_area := null;
      end if;

      if new.published_at is null then
        new.published_at := now();
      end if;
    else
      new.buyer_market_area := null;
      if new.status<>'published' then
        new.published_at := null;
      end if;
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.guard_produce_lot_publication() from public,anon,authenticated;
drop trigger if exists produce_lots_publication_guard on public.produce_lots;
create trigger produce_lots_publication_guard
before insert or update of status,owner_id,approximate_area,available_from,sell_by,quantity,crop
on public.produce_lots
for each row execute function private.guard_produce_lot_publication();

create or replace function private.sync_buyer_market_area_consent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.approximate_location_sharing is distinct from old.approximate_location_sharing then
    update public.produce_lots
    set buyer_market_area = case
      when new.approximate_location_sharing and status='published'
        then nullif(trim(approximate_area),'')
      else null
    end
    where owner_id=new.id and status='published';
  end if;
  return new;
end;
$$;

revoke all on function private.sync_buyer_market_area_consent() from public,anon,authenticated;
drop trigger if exists profiles_sync_buyer_market_area_consent on public.profiles;
create trigger profiles_sync_buyer_market_area_consent
after update of approximate_location_sharing on public.profiles
for each row execute function private.sync_buyer_market_area_consent();

create or replace view public.buyer_marketplace_lots
with (security_barrier = true, security_invoker = true)
as
select
  lot.id,lot.crop,lot.variety,lot.grade,lot.quantity,lot.unit,
  lot.buyer_market_area as approximate_area,
  lot.available_from,lot.sell_by,lot.created_at
from public.produce_lots lot
where lot.status='published'
  and coalesce(auth.jwt() -> 'app_metadata' ->> 'farmess_role','')='buyer';

grant select (buyer_market_area,published_at) on public.produce_lots to authenticated;
grant select on public.buyer_marketplace_lots to authenticated;

comment on column public.produce_lots.buyer_market_area is
  'Copied from approximate_area only while farmer approximate-location sharing consent is enabled; cleared when consent is revoked.';
comment on column public.produce_lots.published_at is
  'Set by database trigger when an owner publishes a valid lot.';
comment on function private.guard_produce_lot_publication() is
  'Forces new farmer lots to draft and validates allowed publish/withdraw transitions; buyer-visible locality follows explicit profile consent.';
comment on function private.sync_buyer_market_area_consent() is
  'Synchronizes buyer-visible lot area to farmer approximate-location consent.';
notify pgrst,'reload schema';
