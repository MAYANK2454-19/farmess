create or replace function private.enforce_offer_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lot public.produce_lots%rowtype;
  v_offer_kg numeric;
  v_lot_kg numeric;
  v_accepted_kg numeric;
begin
  if tg_op = 'INSERT' then
    if auth.uid() is null
      or auth.uid() <> new.buyer_id
      or coalesce(auth.jwt() -> 'app_metadata' ->> 'farmess_role', '') <> 'buyer'
    then
      raise exception 'Only the authenticated buyer can create an offer.';
    end if;
  else
    if new.buyer_id <> old.buyer_id
      or new.farmer_id <> old.farmer_id
      or new.lot_id <> old.lot_id
      or new.price_paise_per_quintal <> old.price_paise_per_quintal
      or new.quantity <> old.quantity
      or new.unit <> old.unit
      or new.valid_until <> old.valid_until
      or new.terms is distinct from old.terms
    then
      raise exception 'Offer terms are immutable after creation.';
    end if;

    if auth.uid() = new.farmer_id
      and coalesce(auth.jwt() -> 'app_metadata' ->> 'farmess_role', '') = 'farmer'
      and old.status = 'pending'
      and new.status = 'accepted'
      and new.valid_until <= now()
    then
      raise exception 'This offer has expired and cannot be accepted.';
    end if;
  end if;

  -- Serialize acceptances for the same lot to prevent concurrent overselling.
  if tg_op = 'UPDATE' and old.status <> 'accepted' and new.status = 'accepted' then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(new.lot_id::text, 0)
    );
  end if;

  select * into v_lot
  from public.produce_lots
  where id = new.lot_id and owner_id = new.farmer_id;

  if not found then
    raise exception 'The selected produce lot no longer exists.';
  end if;

  if (tg_op = 'INSERT' or new.status = 'accepted') and v_lot.status <> 'published' then
    raise exception 'The selected produce lot is not available for offers.';
  end if;

  v_offer_kg := new.quantity * case new.unit
    when 'kg' then 1
    when 'quintal' then 100
    else 1000
  end;
  v_lot_kg := v_lot.quantity * case v_lot.unit
    when 'kg' then 1
    when 'quintal' then 100
    else 1000
  end;

  if v_offer_kg > v_lot_kg then
    raise exception 'Offer quantity cannot exceed the available lot quantity.';
  end if;

  if tg_op = 'INSERT' and new.valid_until <= now() then
    raise exception 'Offer validity must be in the future.';
  end if;

  if tg_op = 'UPDATE' and old.status <> 'accepted' and new.status = 'accepted' then
    select coalesce(sum(
      existing_offer.quantity * case existing_offer.unit
        when 'kg' then 1
        when 'quintal' then 100
        else 1000
      end
    ), 0)
    into v_accepted_kg
    from public.offers existing_offer
    where existing_offer.lot_id = new.lot_id
      and existing_offer.status = 'accepted'
      and existing_offer.id <> new.id;

    if v_accepted_kg + v_offer_kg > v_lot_kg then
      raise exception 'Accepted offers would exceed the remaining quantity of this lot.';
    end if;
  end if;

  return new;
end;
$$;

create or replace function private.enforce_produce_lot_accepted_quantity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lot_kg numeric;
  v_accepted_kg numeric;
begin
  if new.quantity is not distinct from old.quantity
    and new.unit is not distinct from old.unit
  then
    return new;
  end if;

  -- Serialize lot edits with offer acceptances for this lot.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(new.id::text, 0)
  );

  v_lot_kg := new.quantity * case new.unit
    when 'kg' then 1
    when 'quintal' then 100
    else 1000
  end;

  select coalesce(sum(
    accepted_offer.quantity * case accepted_offer.unit
      when 'kg' then 1
      when 'quintal' then 100
      else 1000
    end
  ), 0)
  into v_accepted_kg
  from public.offers accepted_offer
  where accepted_offer.lot_id = new.id
    and accepted_offer.status = 'accepted';

  if v_accepted_kg > v_lot_kg then
    raise exception 'A lot cannot be reduced below quantities already agreed in accepted offers.';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_offer_rules() from public, anon, authenticated;
revoke all on function private.enforce_produce_lot_accepted_quantity() from public, anon, authenticated;

drop trigger if exists produce_lots_capacity_guard on public.produce_lots;
create trigger produce_lots_capacity_guard
before update of quantity, unit on public.produce_lots
for each row execute function private.enforce_produce_lot_accepted_quantity();

comment on function private.enforce_offer_rules() is
  'Enforces trusted buyer offers, published lot state, immutable terms, expiry and aggregate accepted quantity per lot.';
comment on function private.enforce_produce_lot_accepted_quantity() is
  'Prevents an owner from reducing a lot below the total quantity already agreed in accepted offers.';
