create extension if not exists postgis with schema extensions;

alter table public.service_listings
  add column if not exists service_location extensions.geography(Point,4326),
  add column if not exists destination_location extensions.geography(Point,4326),
  add column if not exists service_radius_km numeric(7,2),
  add column if not exists crop_suitability text[] not null default '{}',
  add column if not exists cold_chain_available boolean not null default false,
  add column if not exists verification_state varchar(24) not null default 'unverified',
  add column if not exists rate_basis varchar(24) not null default 'quote_required';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'service_listings_radius_range_check') then
    alter table public.service_listings add constraint service_listings_radius_range_check
      check (service_radius_km is null or (service_radius_km > 0 and service_radius_km <= 500));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'service_listings_verification_state_check') then
    alter table public.service_listings add constraint service_listings_verification_state_check
      check (verification_state in ('unverified','contact_verified','document_verified','platform_verified','suspended'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'service_listings_rate_basis_check') then
    alter table public.service_listings add constraint service_listings_rate_basis_check
      check (rate_basis in ('per_trip','per_km','per_kg','per_quintal','per_tonne','per_day','fixed','quote_required'));
  end if;
end
$$;

create index if not exists service_listings_service_location_gist_idx
  on public.service_listings using gist (service_location) where service_location is not null;
create index if not exists service_listings_destination_location_gist_idx
  on public.service_listings using gist (destination_location) where destination_location is not null;
create index if not exists service_listings_active_type_idx
  on public.service_listings (service_type, status, available_from, available_until);

grant select (
  id, operator_id, service_type, title, description, service_area, destination_area,
  capacity_quantity, capacity_unit, price_paise, available_from, available_until,
  status, created_at, service_location, destination_location, service_radius_km,
  crop_suitability, cold_chain_available, verification_state, rate_basis
) on public.service_listings to anon, authenticated;

grant insert (
  service_location, destination_location, service_radius_km, crop_suitability,
  cold_chain_available, verification_state, rate_basis
) on public.service_listings to authenticated;
grant update (
  service_location, destination_location, service_radius_km, crop_suitability,
  cold_chain_available, verification_state, rate_basis
) on public.service_listings to authenticated;

create or replace function public.find_nearby_service_listings(
  p_latitude double precision,
  p_longitude double precision,
  p_radius_meters integer default 25000,
  p_service_type text default null,
  p_crop text default null,
  p_required_quantity numeric default null,
  p_unit text default null,
  p_required_date date default null,
  p_requires_cold_chain boolean default false
)
returns table (
  id uuid, title text, service_type text, service_area text, destination_area text,
  description text, price_paise bigint, rate_basis text, capacity_quantity numeric,
  capacity_unit text, available_from date, available_until date, service_radius_km numeric,
  crop_suitability text[], cold_chain_available boolean, verification_state text,
  latitude double precision, longitude double precision,
  destination_latitude double precision, destination_longitude double precision,
  distance_meters double precision, capacity_match boolean, crop_match boolean,
  date_match boolean, cold_chain_match boolean
)
language plpgsql stable security invoker set search_path = ''
as $$
declare
  v_origin extensions.geography(Point,4326);
  v_required_kg numeric;
begin
  if auth.uid() is null
     or coalesce(auth.jwt() -> 'app_metadata' ->> 'farmess_role', '') <> 'farmer'
  then raise exception 'A signed-in farmer account is required.'; end if;

  if p_latitude is null or p_longitude is null
     or p_latitude < -90 or p_latitude > 90
     or p_longitude < -180 or p_longitude > 180
  then raise exception 'A valid latitude and longitude are required.'; end if;

  if p_radius_meters is null or p_radius_meters < 500 or p_radius_meters > 100000
  then raise exception 'Search radius must be between 500 and 100000 metres.'; end if;

  if p_service_type is not null and p_service_type not in ('transport','storage')
  then raise exception 'Service type must be transport or storage.'; end if;

  if p_required_quantity is not null then
    if p_required_quantity <= 0 or p_unit not in ('kg','quintal','tonne')
    then raise exception 'A positive quantity and valid unit are required together.'; end if;
    v_required_kg := p_required_quantity * case p_unit
      when 'kg' then 1 when 'quintal' then 100 when 'tonne' then 1000 else 0 end;
  else
    v_required_kg := null;
  end if;

  v_origin := extensions.ST_SetSRID(extensions.ST_MakePoint(p_longitude,p_latitude),4326)::extensions.geography;

  return query
  select
    listing.id, listing.title::text, listing.service_type::text, listing.service_area::text,
    listing.destination_area::text, listing.description::text, listing.price_paise,
    listing.rate_basis::text, listing.capacity_quantity, listing.capacity_unit::text,
    listing.available_from, listing.available_until, listing.service_radius_km,
    listing.crop_suitability, listing.cold_chain_available, listing.verification_state::text,
    extensions.ST_Y(listing.service_location::extensions.geometry)::double precision,
    extensions.ST_X(listing.service_location::extensions.geometry)::double precision,
    extensions.ST_Y(listing.destination_location::extensions.geometry)::double precision,
    extensions.ST_X(listing.destination_location::extensions.geometry)::double precision,
    extensions.ST_Distance(listing.service_location,v_origin)::double precision,
    case when v_required_kg is null or listing.capacity_quantity is null then null
      when listing.capacity_quantity * case listing.capacity_unit
        when 'kg' then 1 when 'quintal' then 100 when 'tonne' then 1000 else 0 end >= v_required_kg
      then true else false end,
    case when p_crop is null or cardinality(listing.crop_suitability)=0 then null
      when exists (select 1 from unnest(listing.crop_suitability) as supported_crop
        where lower(trim(supported_crop))=lower(trim(p_crop))) then true else false end,
    case when p_required_date is null then null
      when listing.available_from is null and listing.available_until is null then null
      else ((listing.available_from is null or listing.available_from<=p_required_date)
        and (listing.available_until is null or listing.available_until>=p_required_date)) end,
    case when p_requires_cold_chain then listing.cold_chain_available else null end
  from public.service_listings listing
  where listing.status='active'
    and listing.verification_state<>'suspended'
    and listing.service_location is not null
    and (p_service_type is null or listing.service_type=p_service_type)
    and extensions.ST_DWithin(listing.service_location,v_origin,p_radius_meters)
    and (p_required_date is null or listing.available_from is null or listing.available_from<=p_required_date)
    and (p_required_date is null or listing.available_until is null or listing.available_until>=p_required_date)
  order by listing.service_location operator(extensions.<->) v_origin;
end;
$$;

revoke all on function public.find_nearby_service_listings(double precision,double precision,integer,text,text,numeric,text,date,boolean) from public,anon;
grant execute on function public.find_nearby_service_listings(double precision,double precision,integer,text,text,numeric,text,date,boolean) to authenticated;

create table if not exists public.logistics_recommendation_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  service_listing_id uuid not null references public.service_listings(id) on delete cascade,
  recommendation_version varchar(40) not null,
  rank_position integer not null check (rank_position>0),
  distance_meters numeric(12,2) not null check (distance_meters>=0),
  capacity_match boolean,
  crop_match boolean,
  date_match boolean,
  cold_chain_match boolean,
  user_feedback smallint check (user_feedback between 1 and 5),
  feedback_note varchar(300),
  created_at timestamptz not null default now()
);
create index if not exists logistics_recommendation_feedback_user_idx
  on public.logistics_recommendation_feedback(user_id,created_at desc);
create index if not exists logistics_recommendation_feedback_listing_idx
  on public.logistics_recommendation_feedback(service_listing_id,created_at desc);
alter table public.logistics_recommendation_feedback enable row level security;
create policy logistics_recommendation_feedback_select_own on public.logistics_recommendation_feedback
  for select to authenticated using ((select auth.uid())=user_id);
create policy logistics_recommendation_feedback_insert_own on public.logistics_recommendation_feedback
  for insert to authenticated with check ((select auth.uid())=user_id);
create policy logistics_recommendation_feedback_update_own on public.logistics_recommendation_feedback
  for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
grant select,insert on public.logistics_recommendation_feedback to authenticated;
grant update (user_feedback,feedback_note) on public.logistics_recommendation_feedback to authenticated;

create table if not exists public.market_forecast_runs (
  id uuid primary key default gen_random_uuid(),
  crop varchar(120) not null, variety varchar(120), state varchar(120), district varchar(120),
  market_name varchar(160) not null,
  horizon_days integer not null check (horizon_days between 1 and 30),
  model_name varchar(100) not null, model_version varchar(80) not null,
  training_observation_count integer not null check (training_observation_count>=0),
  training_start date, training_end date,
  baseline_mae_paise_per_quintal numeric(14,2), model_mae_paise_per_quintal numeric(14,2),
  baseline_smape_percent numeric(8,3), model_smape_percent numeric(8,3),
  status varchar(24) not null default 'candidate'
    check (status in ('candidate','approved','rejected','insufficient_data','disabled')),
  generated_at timestamptz not null default now(), approved_at timestamptz,
  created_at timestamptz not null default now(),
  check (status<>'approved' or (training_observation_count>=60 and training_start is not null
    and training_end is not null and model_mae_paise_per_quintal is not null
    and baseline_mae_paise_per_quintal is not null
    and model_mae_paise_per_quintal<baseline_mae_paise_per_quintal and approved_at is not null))
);
create table if not exists public.market_forecast_points (
  id uuid primary key default gen_random_uuid(),
  forecast_run_id uuid not null references public.market_forecast_runs(id) on delete cascade,
  target_date date not null,
  predicted_modal_price_paise_per_quintal numeric(14,2) not null check (predicted_modal_price_paise_per_quintal>0),
  lower_bound_paise_per_quintal numeric(14,2), upper_bound_paise_per_quintal numeric(14,2),
  created_at timestamptz not null default now(),
  unique (forecast_run_id,target_date),
  check ((lower_bound_paise_per_quintal is null or lower_bound_paise_per_quintal>0)
    and (upper_bound_paise_per_quintal is null or upper_bound_paise_per_quintal>0)
    and (lower_bound_paise_per_quintal is null or upper_bound_paise_per_quintal is null
      or lower_bound_paise_per_quintal<=upper_bound_paise_per_quintal))
);
create index if not exists market_forecast_runs_lookup_idx
  on public.market_forecast_runs(lower(crop),lower(market_name),generated_at desc);
create index if not exists market_forecast_points_run_date_idx
  on public.market_forecast_points(forecast_run_id,target_date);
alter table public.market_forecast_runs enable row level security;
alter table public.market_forecast_points enable row level security;
create policy market_forecast_runs_read_approved on public.market_forecast_runs
  for select to anon,authenticated using (status='approved');
create policy market_forecast_points_read_approved on public.market_forecast_points
  for select to anon,authenticated using (exists (
    select 1 from public.market_forecast_runs run
    where run.id=forecast_run_id and run.status='approved'
  ));
grant select on public.market_forecast_runs,public.market_forecast_points to anon,authenticated;
grant all on public.market_forecast_runs,public.market_forecast_points to service_role;

create schema if not exists private;
revoke all on schema private from public,anon,authenticated;
grant usage on schema private to service_role;
create table if not exists private.ml_model_registry (
  id uuid primary key default gen_random_uuid(),
  domain varchar(60) not null check (domain in
    ('market_price_forecast','logistics_ranker','buyer_lot_matcher','post_harvest_risk','image_quality')),
  model_name varchar(100) not null, model_version varchar(80) not null,
  feature_schema_version varchar(80) not null, training_rows integer not null check (training_rows>=0),
  training_start date, training_end date,
  evaluation_metrics jsonb not null default '{}'::jsonb,
  baseline_metrics jsonb not null default '{}'::jsonb,
  artifact_location text,
  approval_status varchar(24) not null default 'candidate'
    check (approval_status in ('candidate','approved','disabled','insufficient_data')),
  trained_at timestamptz not null default now(), approved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (domain,model_name,model_version)
);
revoke all on private.ml_model_registry from public,anon,authenticated;
grant all on private.ml_model_registry to service_role;

comment on column public.service_listings.service_location is
  'Provider-published service location. This is not the farmer origin; callers must obtain farmer location only after an explicit user action.';
comment on column public.service_listings.verification_state is
  'Verification evidence state; unverified listings must never be presented as verified.';
comment on column public.service_listings.rate_basis is
  'Explicit rate basis; only same-basis rates may be compared directly.';
comment on table public.logistics_recommendation_feedback is
  'User-scoped feedback about displayed logistics recommendations; it is not a completed-booking label.';
comment on table public.market_forecast_runs is
  'Only approved, evaluation-backed forecast runs are readable by clients.';
comment on table public.market_forecast_points is
  'Forecast points are visible only when their parent run has been approved.';
comment on table private.ml_model_registry is
  'Private registry for model versions, evaluation metrics, and controlled promotion to production.';
