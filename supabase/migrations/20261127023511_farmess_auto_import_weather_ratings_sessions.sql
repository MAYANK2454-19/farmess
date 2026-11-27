-- Automatic price import, district weather, ratings after completed work, sale
-- steps and a per-user session list.
--
-- Security model
--  * Market prices and weather are still written only by trusted code. The app
--    server proves itself with a token derived from a server-only secret; the
--    database stores only the SHA-256 of that token (private.server_tokens, set
--    out-of-band, never in this repository). Signed-in users therefore cannot
--    insert prices or weather by calling these functions themselves.
--  * Ratings can only be written through submit_rating(), which checks that the
--    caller took part in a completed sale or service request and has not rated
--    it before.
--  * All functions run as definer with an empty search_path.

-- ---------------------------------------------------------------------------
-- 1. Server-authorised ingestion
-- ---------------------------------------------------------------------------
create table if not exists private.server_tokens (
  name text primary key,
  token_sha256 text not null check (token_sha256 ~ '^[0-9a-f]{64}$'),
  updated_at timestamptz not null default now()
);
alter table private.server_tokens enable row level security;
revoke all on private.server_tokens from public, anon, authenticated;

create or replace function private.server_token_ok(p_name text, p_token text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_token is not null
     and length(p_token) between 32 and 200
     and exists (
       select 1
         from private.server_tokens t
        where t.name = p_name
          and t.token_sha256 = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
     );
$$;
revoke all on function private.server_token_ok(text, text) from public, anon, authenticated;

-- One import per crop/district at a time, with a cool-down between attempts.
create table if not exists private.market_import_claims (
  series_key text primary key check (length(series_key) between 3 and 300),
  claimed_at timestamptz not null default now(),
  retry_after timestamptz not null,
  last_outcome text
);
alter table private.market_import_claims enable row level security;
revoke all on private.market_import_claims from public, anon, authenticated;

create or replace function public.claim_market_import(p_token text, p_series_key text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claimed boolean;
begin
  if not private.server_token_ok('market-ingest', p_token) then
    raise exception 'Not authorised.' using errcode = '42501';
  end if;

  insert into private.market_import_claims as c (series_key, claimed_at, retry_after)
  values (p_series_key, now(), now() + interval '15 minutes')
  on conflict (series_key) do update
    set claimed_at = now(), retry_after = now() + interval '15 minutes'
    where c.retry_after <= now()
  returning true into v_claimed;

  return coalesce(v_claimed, false);
end;
$$;

create or replace function public.finish_market_import(
  p_token text,
  p_series_key text,
  p_outcome text,
  p_retry_seconds integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.server_token_ok('market-ingest', p_token) then
    raise exception 'Not authorised.' using errcode = '42501';
  end if;

  update private.market_import_claims c
     set last_outcome = left(p_outcome, 60),
         retry_after = now()
           + make_interval(secs => greatest(60, least(coalesce(p_retry_seconds, 900), 604800)))
   where c.series_key = p_series_key;
end;
$$;

-- Validated upsert of AGMARKNET history rows fetched by the server, with an audit row.
create or replace function public.ingest_market_observations(
  p_token text,
  p_rows jsonb,
  p_filters jsonb,
  p_received integer,
  p_note text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_saved integer := 0;
begin
  if not private.server_token_ok('market-ingest', p_token) then
    raise exception 'Not authorised.' using errcode = '42501';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 2000 then
    raise exception 'Send between 0 and 2000 rows.';
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
           v.observation_date, now(), 'OGD India / AGMARKNET',
           'https://data.gov.in/resource/variety-wise-daily-market-prices-data-commodity'
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
    case when v_saved > 0 then 'stale' else 'no-data' end,
    coalesce(p_filters, '{}'::jsonb),
    greatest(coalesce(p_received, 0), 0), v_saved, left(p_note, 500)
  );

  return v_saved;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. District weather (Open-Meteo), used as features for the price forecast
-- ---------------------------------------------------------------------------
create table if not exists public.weather_daily (
  state varchar(120) not null,
  district varchar(120) not null,
  observation_date date not null,
  rain_mm numeric(7, 2) check (rain_mm is null or (rain_mm >= 0 and rain_mm <= 2000)),
  tmax_c numeric(5, 2) check (tmax_c is null or (tmax_c between -60 and 65)),
  tmin_c numeric(5, 2) check (tmin_c is null or (tmin_c between -70 and 60)),
  latitude numeric(7, 4) not null check (latitude between -90 and 90),
  longitude numeric(7, 4) not null check (longitude between -180 and 180),
  source_name varchar(60) not null default 'Open-Meteo',
  retrieved_at timestamptz not null default now(),
  primary key (state, district, observation_date)
);
alter table public.weather_daily enable row level security;
drop policy if exists weather_daily_read_public on public.weather_daily;
create policy weather_daily_read_public on public.weather_daily
  for select to anon, authenticated using (true);
revoke all on public.weather_daily from anon, authenticated;
grant select on public.weather_daily to anon, authenticated;

comment on table public.weather_daily is
  'Observed daily weather at a district centre (Open-Meteo, CC BY 4.0). Written only by the app server through ingest_weather_daily().';

create or replace function public.ingest_weather_daily(
  p_token text,
  p_state text,
  p_district text,
  p_latitude numeric,
  p_longitude numeric,
  p_rows jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_saved integer := 0;
begin
  if not private.server_token_ok('market-ingest', p_token) then
    raise exception 'Not authorised.' using errcode = '42501';
  end if;
  if nullif(trim(p_state), '') is null or nullif(trim(p_district), '') is null
     or p_latitude is null or p_longitude is null
     or p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 800
  then
    raise exception 'Invalid weather payload.';
  end if;

  with parsed as (
    select (r ->> 'date')::date as d,
           (r ->> 'rain_mm')::numeric as rain,
           (r ->> 'tmax_c')::numeric as tmax,
           (r ->> 'tmin_c')::numeric as tmin
      from jsonb_array_elements(p_rows) as r
  ),
  upserted as (
    insert into public.weather_daily (
      state, district, observation_date, rain_mm, tmax_c, tmin_c, latitude, longitude
    )
    select distinct on (p.d) trim(p_state), trim(p_district), p.d,
           round(p.rain, 2), round(p.tmax, 2), round(p.tmin, 2),
           round(p_latitude, 4), round(p_longitude, 4)
      from parsed p
     where p.d between date '2000-01-01' and current_date
       and (p.rain is null or p.rain between 0 and 2000)
       and (p.tmax is null or p.tmax between -60 and 65)
       and (p.tmin is null or p.tmin between -70 and 60)
       and (p.rain is not null or p.tmax is not null or p.tmin is not null)
     order by p.d
    on conflict (state, district, observation_date) do update set
      rain_mm = excluded.rain_mm,
      tmax_c = excluded.tmax_c,
      tmin_c = excluded.tmin_c,
      latitude = excluded.latitude,
      longitude = excluded.longitude,
      retrieved_at = now()
    returning 1
  )
  select count(*) into v_saved from upserted;

  return v_saved;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Ratings after a completed sale or service request
-- ---------------------------------------------------------------------------
create table if not exists public.ratings (
  id uuid primary key default gen_random_uuid(),
  rater_id uuid not null references public.profiles(id) on delete cascade,
  ratee_id uuid not null references public.profiles(id) on delete cascade,
  context_type varchar(24) not null check (context_type in ('sale', 'service_request')),
  context_id uuid not null,
  stars smallint not null check (stars between 1 and 5),
  comment varchar(300),
  created_at timestamptz not null default now(),
  constraint ratings_no_self_rating check (rater_id <> ratee_id),
  constraint ratings_one_per_context unique (rater_id, context_type, context_id)
);
create index if not exists ratings_ratee_idx on public.ratings (ratee_id);
create index if not exists ratings_context_idx on public.ratings (context_type, context_id);

alter table public.ratings enable row level security;
drop policy if exists ratings_select_participant on public.ratings;
create policy ratings_select_participant on public.ratings
  for select to authenticated
  using ((select auth.uid()) in (rater_id, ratee_id));
revoke all on public.ratings from anon, authenticated;
grant select on public.ratings to authenticated;

comment on table public.ratings is
  'One rating per rater per completed sale or service request. Inserted only by submit_rating(); aggregates are exposed by the *_ratings functions.';

create or replace function public.submit_rating(
  p_context_type text,
  p_context_id uuid,
  p_stars integer,
  p_comment text
)
returns table (id uuid, stars smallint, created_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_ratee uuid;
  v_comment text := nullif(trim(coalesce(p_comment, '')), '');
  v_id uuid;
  v_what text;
begin
  if v_uid is null then
    raise exception 'Sign in to rate.';
  end if;
  if p_stars is null or p_stars < 1 or p_stars > 5 then
    raise exception 'Choose a rating from 1 to 5 stars.';
  end if;
  if v_comment is not null and length(v_comment) > 300 then
    raise exception 'Keep the comment to 300 characters or fewer.';
  end if;

  if p_context_type = 'service_request' then
    select case when r.requester_id = v_uid then r.provider_user_id
                when r.provider_user_id = v_uid then r.requester_id end
      into v_ratee
      from public.service_requests r
     where r.id = p_context_id
       and r.status = 'completed'
       and v_uid in (r.requester_id, r.provider_user_id);
    v_what := 'service';
  elsif p_context_type = 'sale' then
    select case when s.buyer_id = v_uid then s.farmer_id
                when s.farmer_id = v_uid then s.buyer_id end
      into v_ratee
      from public.sales s
     where s.id = p_context_id
       and s.status in ('delivered', 'paid')
       and v_uid in (s.buyer_id, s.farmer_id);
    v_what := 'sale';
  else
    raise exception 'Choose a sale or a service request to rate.';
  end if;

  if v_ratee is null then
    raise exception 'You can rate only after a sale or service you took part in is completed.';
  end if;

  begin
    insert into public.ratings (rater_id, ratee_id, context_type, context_id, stars, comment)
    values (v_uid, v_ratee, p_context_type, p_context_id, p_stars::smallint, v_comment)
    returning ratings.id into v_id;
  exception when unique_violation then
    raise exception 'You have already rated this.';
  end;

  insert into public.notifications (recipient_user_id, event_key, title, body, related_type, related_id)
  values (v_ratee, 'rating_received', 'You received a rating',
    'You were rated ' || p_stars || ' out of 5 for a completed ' || v_what || '.', 'rating', v_id);

  return query
    select g.id, g.stars, g.created_at from public.ratings g where g.id = v_id;
end;
$$;

create or replace function private.rating_summary(p_user uuid)
returns table (average numeric, rating_count integer)
language sql
stable
security definer
set search_path = ''
as $$
  select round(avg(g.stars)::numeric, 2), count(*)::integer
    from public.ratings g
   where g.ratee_id = p_user;
$$;
revoke all on function private.rating_summary(uuid) from public, anon, authenticated;

-- Reputation of any Farmess user (aggregates only).
create or replace function public.user_rating_summaries(p_user_ids uuid[])
returns table (user_id uuid, average numeric, rating_count integer)
language sql
stable
security definer
set search_path = ''
as $$
  select g.ratee_id, round(avg(g.stars)::numeric, 2), count(*)::integer
    from public.ratings g
   where auth.uid() is not null
     and g.ratee_id = any(coalesce(p_user_ids, '{}'))
   group by g.ratee_id;
$$;

-- Reputation of the provider behind each service listing.
create or replace function public.listing_provider_ratings(p_listing_ids uuid[])
returns table (listing_id uuid, average numeric, rating_count integer)
language sql
stable
security definer
set search_path = ''
as $$
  select l.id, round(avg(g.stars)::numeric, 2), count(g.id)::integer
    from public.service_listings l
    join public.ratings g on g.ratee_id = l.operator_id
   where auth.uid() is not null
     and l.id = any(coalesce(p_listing_ids, '{}'))
   group by l.id;
$$;

-- Reputation of the farmer behind each published lot, without revealing who they are.
create or replace function public.lot_owner_ratings(p_lot_ids uuid[])
returns table (lot_id uuid, average numeric, rating_count integer)
language sql
stable
security definer
set search_path = ''
as $$
  select l.id, round(avg(g.stars)::numeric, 2), count(g.id)::integer
    from public.produce_lots l
    join public.ratings g on g.ratee_id = l.owner_id
   where auth.uid() is not null
     and l.status = 'published'
     and l.id = any(coalesce(p_lot_ids, '{}'))
   group by l.id;
$$;

-- Buyer demand now carries the buyer's reputation.
drop function if exists public.farmer_buyer_demand();
create function public.farmer_buyer_demand()
returns table (
  id uuid,
  crop text,
  variety text,
  grade text,
  min_quantity numeric,
  max_quantity numeric,
  unit text,
  market_area text,
  delivery_by date,
  target_price_paise_per_quintal bigint,
  created_at timestamptz,
  buyer_label text,
  buyer_type text,
  buyer_phone text,
  buyer_email text,
  buyer_rating_average numeric,
  buyer_rating_count integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null
     or coalesce(auth.jwt() -> 'app_metadata' ->> 'farmess_role', '') <> 'farmer'
  then
    raise exception 'A signed-in farmer account is required.';
  end if;

  return query
    select r.id, r.crop::text, r.variety::text, r.grade::text, r.min_quantity, r.max_quantity,
           r.unit::text, r.market_area::text, r.delivery_by, r.target_price_paise_per_quintal,
           r.created_at,
           coalesce(nullif(trim(p.organisation_name), ''),
                    case when p.buyer_contact_disclosure then nullif(trim(p.display_name), '') end,
                    'Registered buyer')::text,
           p.buyer_type::text,
           case when p.buyer_contact_disclosure then p.phone_number::text end,
           case when p.buyer_contact_disclosure then u.email::text end,
           rs.average,
           coalesce(rs.rating_count, 0)
      from public.buyer_requirements r
      join public.profiles p on p.id = r.buyer_id
      join auth.users u on u.id = r.buyer_id
      left join lateral private.rating_summary(r.buyer_id) rs on true
     where r.status = 'active'
       and (r.delivery_by is null or r.delivery_by >= current_date)
     order by r.created_at desc
     limit 300;
end;
$$;

-- Provider reputation captured with each recommendation rating (ranker feature).
alter table public.logistics_recommendation_feedback
  add column if not exists provider_rating_average numeric(3, 2),
  add column if not exists provider_rating_count integer;
alter table public.logistics_recommendation_feedback
  drop constraint if exists logistics_feedback_provider_rating_check;
alter table public.logistics_recommendation_feedback
  add constraint logistics_feedback_provider_rating_check
  check (
    (provider_rating_average is null or provider_rating_average between 1 and 5)
    and (provider_rating_count is null or provider_rating_count >= 0)
  );

-- ---------------------------------------------------------------------------
-- 4. Sale steps: dispatched -> delivered -> paid
-- ---------------------------------------------------------------------------
create or replace function public.advance_sale(p_sale_id uuid, p_action text)
returns table (id uuid, status text, updated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_sale public.sales%rowtype;
  v_next text;
  v_event text;
  v_summary text;
  v_notify uuid;
  v_title text;
  v_body text;
begin
  if v_uid is null then
    raise exception 'Sign in to update a sale.';
  end if;

  select * into v_sale from public.sales s where s.id = p_sale_id for update;
  if not found or v_uid not in (v_sale.buyer_id, v_sale.farmer_id) then
    raise exception 'This sale is not available to your account.';
  end if;

  if p_action = 'dispatch' and v_uid = v_sale.farmer_id and v_sale.status = 'agreed' then
    v_next := 'dispatched';
    v_event := 'sale_dispatched';
    v_summary := 'Farmer marked the produce as dispatched.';
    v_notify := v_sale.buyer_id;
    v_title := 'Produce dispatched';
    v_body := 'The farmer marked your purchase as dispatched. Confirm when you receive it.';
  elsif p_action = 'confirm_delivery' and v_uid = v_sale.buyer_id
        and v_sale.status in ('agreed', 'dispatched') then
    v_next := 'delivered';
    v_event := 'sale_delivered';
    v_summary := 'Buyer confirmed the produce was received.';
    v_notify := v_sale.farmer_id;
    v_title := 'Delivery confirmed';
    v_body := 'The buyer confirmed receiving the produce. You can now rate each other.';
  elsif p_action = 'confirm_payment' and v_uid = v_sale.farmer_id
        and v_sale.status in ('delivered', 'payment_pending') then
    v_next := 'paid';
    v_event := 'sale_paid';
    v_summary := 'Farmer confirmed the payment was received.';
    v_notify := v_sale.buyer_id;
    v_title := 'Payment confirmed';
    v_body := 'The farmer confirmed receiving the payment. This sale is complete.';
  else
    raise exception 'This step is not available for the current status of the sale.';
  end if;

  update public.sales s set status = v_next, updated_at = now() where s.id = p_sale_id;

  insert into public.sale_activity (sale_id, actor_user_id, participant_user_ids, event_key, summary)
  values (p_sale_id, v_uid, array[v_sale.buyer_id, v_sale.farmer_id], v_event, v_summary);

  insert into public.notifications (recipient_user_id, event_key, title, body, related_type, related_id)
  values (v_notify, v_event, v_title, v_body, 'sale', p_sale_id);

  return query
    select s.id, s.status::text, s.updated_at from public.sales s where s.id = p_sale_id;
end;
$$;

-- The caller's sales with what they need to act on them. Contact details are
-- shown because a sale exists only after the offer was accepted.
create or replace function public.my_sales()
returns table (
  id uuid,
  my_role text,
  crop text,
  variety text,
  agreed_quantity numeric,
  unit text,
  agreed_price_paise_per_quintal bigint,
  status text,
  agreed_at timestamptz,
  updated_at timestamptz,
  counterparty_name text,
  counterparty_organisation text,
  counterparty_phone text,
  counterparty_email text,
  counterparty_rating_average numeric,
  counterparty_rating_count integer,
  my_stars smallint,
  their_stars smallint
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id,
         case when s.farmer_id = auth.uid() then 'farmer' else 'buyer' end,
         l.crop::text, l.variety::text,
         s.agreed_quantity, s.unit::text, s.agreed_price_paise_per_quintal,
         s.status::text, s.agreed_at, s.updated_at,
         nullif(trim(p.display_name), '')::text,
         nullif(trim(p.organisation_name), '')::text,
         p.phone_number::text,
         u.email::text,
         rs.average,
         coalesce(rs.rating_count, 0),
         (select g.stars from public.ratings g
           where g.context_type = 'sale' and g.context_id = s.id and g.rater_id = auth.uid()),
         (select g.stars from public.ratings g
           where g.context_type = 'sale' and g.context_id = s.id and g.ratee_id = auth.uid())
    from public.sales s
    join public.produce_lots l on l.id = s.lot_id
    join public.profiles p
      on p.id = case when s.farmer_id = auth.uid() then s.buyer_id else s.farmer_id end
    join auth.users u on u.id = p.id
    left join lateral private.rating_summary(p.id) rs on true
   where auth.uid() in (s.buyer_id, s.farmer_id)
   order by s.agreed_at desc
   limit 200;
$$;

-- ---------------------------------------------------------------------------
-- 5. Sign-in sessions of the current user
-- ---------------------------------------------------------------------------
create or replace function public.my_sessions()
returns table (
  id uuid,
  created_at timestamptz,
  last_active_at timestamptz,
  user_agent text,
  is_current boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id,
         s.created_at,
         coalesce(s.refreshed_at at time zone 'UTC', s.updated_at, s.created_at),
         left(s.user_agent, 200),
         s.id::text = coalesce(auth.jwt() ->> 'session_id', '')
    from auth.sessions s
   where s.user_id = auth.uid()
   order by s.created_at desc
   limit 20;
$$;

create or replace function public.revoke_my_session(p_session_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  if auth.uid() is null then
    raise exception 'Sign in to manage sessions.';
  end if;
  delete from auth.sessions s where s.id = p_session_id and s.user_id = auth.uid();
  get diagnostics v_deleted = row_count;
  return v_deleted > 0;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke all on function public.claim_market_import(text, text) from public, anon;
revoke all on function public.finish_market_import(text, text, text, integer) from public, anon;
revoke all on function public.ingest_market_observations(text, jsonb, jsonb, integer, text) from public, anon;
revoke all on function public.ingest_weather_daily(text, text, text, numeric, numeric, jsonb) from public, anon;
revoke all on function public.submit_rating(text, uuid, integer, text) from public, anon;
revoke all on function public.user_rating_summaries(uuid[]) from public, anon;
revoke all on function public.listing_provider_ratings(uuid[]) from public, anon;
revoke all on function public.lot_owner_ratings(uuid[]) from public, anon;
revoke all on function public.farmer_buyer_demand() from public, anon;
revoke all on function public.advance_sale(uuid, text) from public, anon;
revoke all on function public.my_sales() from public, anon;
revoke all on function public.my_sessions() from public, anon;
revoke all on function public.revoke_my_session(uuid) from public, anon;

grant execute on function public.claim_market_import(text, text) to authenticated;
grant execute on function public.finish_market_import(text, text, text, integer) to authenticated;
grant execute on function public.ingest_market_observations(text, jsonb, jsonb, integer, text) to authenticated;
grant execute on function public.ingest_weather_daily(text, text, text, numeric, numeric, jsonb) to authenticated;
grant execute on function public.submit_rating(text, uuid, integer, text) to authenticated;
grant execute on function public.user_rating_summaries(uuid[]) to authenticated;
grant execute on function public.listing_provider_ratings(uuid[]) to authenticated;
grant execute on function public.lot_owner_ratings(uuid[]) to authenticated;
grant execute on function public.farmer_buyer_demand() to authenticated;
grant execute on function public.advance_sale(uuid, text) to authenticated;
grant execute on function public.my_sales() to authenticated;
grant execute on function public.my_sessions() to authenticated;
grant execute on function public.revoke_my_session(uuid) to authenticated;
