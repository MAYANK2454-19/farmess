drop function if exists public.find_nearby_service_listings(
  double precision, double precision, integer, text, text, numeric, text, date, boolean
);

create function public.find_nearby_service_listings(
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
  capacity_unit text, available_from date, available_until date,
  service_radius_km numeric, service_radius_match boolean,
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
    then raise exception 'A positive quantity and valid unit are required.'; end if;
    v_required_kg := p_required_quantity * case p_unit
      when 'kg' then 1 when 'quintal' then 100 when 'tonne' then 1000 else 0 end;
  else
    v_required_kg := null;
  end if;

  v_origin := extensions.ST_SetSRID(
    extensions.ST_MakePoint(p_longitude,p_latitude),4326
  )::extensions.geography;

  return query
  select
    listing.id, listing.title::text, listing.service_type::text, listing.service_area::text,
    listing.destination_area::text, listing.description::text, listing.price_paise,
    listing.rate_basis::text, listing.capacity_quantity, listing.capacity_unit::text,
    listing.available_from, listing.available_until, listing.service_radius_km,
    case when listing.service_radius_km is null then null
      else extensions.ST_Distance(listing.service_location,v_origin)
        <= listing.service_radius_km * 1000 end,
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
  order by listing.service_location operator(extensions.<->) v_origin;
end;
$$;

revoke all on function public.find_nearby_service_listings(
  double precision,double precision,integer,text,text,numeric,text,date,boolean
) from public,anon;
grant execute on function public.find_nearby_service_listings(
  double precision,double precision,integer,text,text,numeric,text,date,boolean
) to authenticated;

notify pgrst, 'reload schema';
