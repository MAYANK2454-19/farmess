-- Structured, approximate profile location: state, district, PIN code and a
-- ~1 km-rounded coordinate pair used as the default origin for nearby
-- logistics search. Readable only by the owner (profiles_select_own); never
-- exposed to buyers or operators.

alter table public.profiles
  add column if not exists state varchar(60)
    check (state is null or char_length(btrim(state)) between 2 and 60),
  add column if not exists district varchar(80)
    check (district is null or char_length(btrim(district)) between 2 and 80),
  add column if not exists pincode char(6)
    check (pincode is null or pincode ~ '^[1-9][0-9]{5}$'),
  add column if not exists location_latitude numeric(5, 2)
    check (location_latitude is null or location_latitude between 6 and 38),
  add column if not exists location_longitude numeric(5, 2)
    check (location_longitude is null or location_longitude between 68 and 98),
  add column if not exists location_source varchar(12)
    check (location_source is null or location_source in ('gps', 'pincode', 'manual')),
  add column if not exists location_updated_at timestamptz;

-- A district needs its state; coordinates come as a pair, rounded to ~1 km.
alter table public.profiles
  drop constraint if exists profiles_district_requires_state,
  drop constraint if exists profiles_location_pair;
alter table public.profiles
  add constraint profiles_district_requires_state check (district is null or state is not null),
  add constraint profiles_location_pair check (
    (location_latitude is null) = (location_longitude is null)
  );

grant update (
  state, district, pincode, location_latitude, location_longitude, location_source,
  location_updated_at
) on public.profiles to authenticated;

comment on column public.profiles.location_latitude is
  'Approximate (~1 km, India bounds) latitude chosen via device location or PIN code; owner-only.';
