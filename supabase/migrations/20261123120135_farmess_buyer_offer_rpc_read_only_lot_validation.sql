create or replace function public.create_buyer_offer(
  p_lot_id uuid,
  p_quantity numeric,
  p_unit text,
  p_price_paise_per_quintal bigint,
  p_valid_until timestamptz,
  p_terms text default null
)
returns table (
  id uuid, lot_id uuid, quantity numeric, unit text,
  price_paise_per_quintal bigint, valid_until timestamptz,
  status text, terms text, created_at timestamptz
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_buyer_id uuid;
  v_farmer_id uuid;
  v_lot_quantity numeric;
  v_lot_unit text;
  v_lot_status text;
begin
  v_buyer_id := auth.uid();
  if v_buyer_id is null
     or coalesce(auth.jwt() -> 'app_metadata' ->> 'farmess_role','')<>'buyer'
  then raise exception 'A signed-in buyer account is required.'; end if;

  if p_lot_id is null or p_quantity is null or p_quantity<=0
     or p_price_paise_per_quintal is null or p_price_paise_per_quintal<=0
     or p_valid_until is null or p_valid_until<=now()
     or (p_terms is not null and length(p_terms)>1000)
     or p_unit not in ('kg','quintal','tonne')
  then raise exception 'Offer terms are invalid.'; end if;

  -- Buyers have read-only lot access. Unaccepted offers do not reserve stock;
  -- inventory is checked atomically by the acceptance transaction instead.
  select lot.owner_id,lot.quantity,lot.unit,lot.status
    into v_farmer_id,v_lot_quantity,v_lot_unit,v_lot_status
  from public.produce_lots lot
  where lot.id=p_lot_id;

  if not found or v_lot_status<>'published'
  then raise exception 'This produce lot is not published or no longer available.'; end if;
  if v_farmer_id=v_buyer_id
  then raise exception 'A buyer cannot make an offer on their own lot.'; end if;
  if p_unit<>v_lot_unit
  then raise exception 'Offer unit must match the published lot unit.'; end if;
  if p_quantity>v_lot_quantity
  then raise exception 'Offer quantity exceeds the published lot quantity.'; end if;

  return query
  insert into public.offers(
    buyer_id,farmer_id,lot_id,quantity,unit,
    price_paise_per_quintal,valid_until,status,terms
  )
  values(
    v_buyer_id,v_farmer_id,p_lot_id,p_quantity,p_unit,
    p_price_paise_per_quintal,p_valid_until,'pending',nullif(trim(p_terms),'')
  )
  returning offers.id,offers.lot_id,offers.quantity,offers.unit::text,
    offers.price_paise_per_quintal,offers.valid_until,offers.status::text,
    offers.terms,offers.created_at;
end;
$$;

revoke all on function public.create_buyer_offer(uuid,numeric,text,bigint,timestamptz,text)
  from public,anon;
grant execute on function public.create_buyer_offer(uuid,numeric,text,bigint,timestamptz,text)
  to authenticated;
