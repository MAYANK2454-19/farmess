-- Farmess: (1) fix buyer offers, (2) let the automatic import also save today's prices.
--
-- 1. public.create_buyer_offer() declared "terms text" in its result but returned the
--    offers.terms column (varchar(1000)) without a cast. PostgreSQL rejects that
--    ("structure of query does not match function result type"), so every buyer offer
--    failed. The only change below is the ::text cast in the RETURNING list.
--
-- 2. public.ingest_market_observations() saved every row with the link of the
--    daily-history resource. It now takes p_source ('history' or 'current') so that
--    today's reports, read from the current-day resource, keep their own source link.
--    Callers that do not pass p_source behave exactly as before.

create or replace function public.create_buyer_offer(
  p_lot_id uuid,
  p_quantity numeric,
  p_unit text,
  p_price_paise_per_quintal bigint,
  p_valid_until timestamptz,
  p_terms text default null
)
returns table (
  id uuid,
  lot_id uuid,
  quantity numeric,
  unit text,
  price_paise_per_quintal bigint,
  valid_until timestamptz,
  status text,
  terms text,
  created_at timestamptz
)
language plpgsql
security definer
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
  then
    raise exception 'A signed-in buyer account is required.';
  end if;

  if p_lot_id is null
     or p_quantity is null
     or p_quantity<=0
     or p_price_paise_per_quintal is null
     or p_price_paise_per_quintal<=0
     or p_valid_until is null
     or p_valid_until<=now()
     or (p_terms is not null and length(p_terms)>1000)
     or p_unit not in ('kg','quintal','tonne')
  then
    raise exception 'Offer terms are invalid.';
  end if;

  -- No row lock is taken here: buyers have read-only access to published lots.
  -- Inventory is reserved/validated atomically by the offer-acceptance transaction,
  -- not when an unaccepted offer is submitted.
  select lot.owner_id,lot.quantity,lot.unit,lot.status
    into v_farmer_id,v_lot_quantity,v_lot_unit,v_lot_status
  from public.produce_lots as lot
  where lot.id=p_lot_id;

  if not found or v_lot_status<>'published' then
    raise exception 'This produce lot is not published or no longer available.';
  end if;
  if v_farmer_id=v_buyer_id then
    raise exception 'A buyer cannot make an offer on their own lot.';
  end if;
  if p_unit<>v_lot_unit then
    raise exception 'Offer unit must match the published lot unit.';
  end if;
  if p_quantity>v_lot_quantity then
    raise exception 'Offer quantity exceeds the published lot quantity.';
  end if;

  return query
  insert into public.offers(
    buyer_id,farmer_id,lot_id,quantity,unit,
    price_paise_per_quintal,valid_until,status,terms
  )
  values(
    v_buyer_id,v_farmer_id,p_lot_id,p_quantity,p_unit,
    p_price_paise_per_quintal,p_valid_until,'pending',nullif(trim(p_terms),'')
  )
  returning
    offers.id,offers.lot_id,offers.quantity,offers.unit::text,
    offers.price_paise_per_quintal,offers.valid_until,offers.status::text,
    offers.terms::text,offers.created_at;
end;
$$;

-- ---------------------------------------------------------------------------

drop function if exists public.ingest_market_observations(text, jsonb, jsonb, integer, text);

create function public.ingest_market_observations(
  p_token text,
  p_rows jsonb,
  p_filters jsonb,
  p_received integer,
  p_note text,
  p_source text default 'history'
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_saved integer := 0;
  v_url text;
begin
  if not private.server_token_ok('market-ingest', p_token) then
    raise exception 'Not authorised.' using errcode = '42501';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 2000 then
    raise exception 'Send between 0 and 2000 rows.';
  end if;

  v_url := case coalesce(p_source, 'history')
    when 'history' then
      'https://data.gov.in/resource/variety-wise-daily-market-prices-data-commodity'
    when 'current' then
      'https://data.gov.in/resource/current-daily-price-various-commodities-various-markets-mandi'
  end;
  if v_url is null then
    raise exception 'Unknown price source.';
  end if;

  with parsed as (
    select
      nullif(trim(r ->> 'crop'), '') as crop,
      nullif(trim(r ->> 'variety'), '') as variety,
      nullif(trim(r ->> 'state'), '') as state,
      nullif(trim(r ->> 'district'), '') as district,
      nullif(trim(r ->> 'market_name'), '') as market_name,
      (r ->> 'min_price_paise_per_quintal')::bigint as min_p,
      (r ->> 'max_price_paise_per_quintal')::bigint as max_p,
      (r ->> 'modal_price_paise_per_quintal')::bigint as modal_p,
      (r ->> 'observation_date')::date as observation_date
    from jsonb_array_elements(p_rows) as r
  ),
  valid as (
    select distinct on (p.crop, p.variety, p.state, p.district, p.market_name, p.observation_date) p.*
      from parsed p
     where p.crop is not null and length(p.crop) <= 80
       and (p.variety is null or length(p.variety) <= 80)
       and p.state is not null and length(p.state) <= 120
       and p.district is not null and length(p.district) <= 120
       and p.market_name is not null and length(p.market_name) <= 160
       and p.observation_date between date '2000-01-01' and current_date
       and (p.min_p is not null or p.max_p is not null or p.modal_p is not null)
       and coalesce(p.min_p, 0) >= 0 and coalesce(p.max_p, 0) >= 0 and coalesce(p.modal_p, 0) >= 0
       and coalesce(greatest(p.min_p, p.max_p, p.modal_p), 0) <= 100000000
       and (p.min_p is null or p.max_p is null or p.min_p <= p.max_p)
       and (p.modal_p is null or p.min_p is null or p.modal_p >= p.min_p)
       and (p.modal_p is null or p.max_p is null or p.modal_p <= p.max_p)
     order by p.crop, p.variety, p.state, p.district, p.market_name, p.observation_date
  ),
  upserted as (
    insert into public.market_observations (
      crop, variety, state, district, market_name,
      min_price_paise_per_quintal, max_price_paise_per_quintal, modal_price_paise_per_quintal,
      observation_date, retrieved_at, source_name, source_url
    )
    select v.crop, v.variety, v.state, v.district, v.market_name,
           v.min_p, v.max_p, v.modal_p,
           v.observation_date, now(), 'OGD India / AGMARKNET', v_url
      from valid v
    on conflict (crop, variety, state, district, market_name, observation_date, source_name)
    do update set
      min_price_paise_per_quintal = excluded.min_price_paise_per_quintal,
      max_price_paise_per_quintal = excluded.max_price_paise_per_quintal,
      modal_price_paise_per_quintal = excluded.modal_price_paise_per_quintal,
      retrieved_at = excluded.retrieved_at,
      source_url = excluded.source_url
    returning 1
  )
  select count(*) into v_saved from upserted;

  insert into public.market_data_ingestion_runs (
    actor_user_id, source_name, status, request_filters,
    records_received, records_upserted, error_message
  )
  values (
    auth.uid(), 'OGD India / AGMARKNET (automatic)',
    case when v_saved > 0 then
           case when coalesce(p_source, 'history') = 'current' then 'available' else 'stale' end
         else 'no-data' end,
    coalesce(p_filters, '{}'::jsonb),
    greatest(coalesce(p_received, 0), 0), v_saved, left(p_note, 500)
  );

  return v_saved;
end;
$$;

revoke all on function public.ingest_market_observations(text, jsonb, jsonb, integer, text, text)
  from public, anon;
grant execute on function public.ingest_market_observations(text, jsonb, jsonb, integer, text, text)
  to authenticated;
