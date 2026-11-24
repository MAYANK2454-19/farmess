-- Role-specific profile details and a reviewed path to buyer/operator access.
--
-- Roles are never self-selected: public sign-up still creates farmers, and the
-- buyer/operator roles are granted only by an admin reviewing an access
-- request. Admin can never be requested.

-- 1. Role-specific profile details (all optional; users edit only their own row).
alter table public.profiles
  add column if not exists own_transport boolean,
  add column if not exists transport_vehicle_type varchar(24)
    check (transport_vehicle_type is null or transport_vehicle_type in
      ('two_wheeler', 'tractor_trolley', 'pickup', 'mini_truck', 'truck', 'other')),
  add column if not exists transport_capacity_quintal numeric(10, 2)
    check (transport_capacity_quintal is null or (transport_capacity_quintal > 0 and transport_capacity_quintal <= 1000)),
  add column if not exists farm_size_acres numeric(10, 2)
    check (farm_size_acres is null or (farm_size_acres > 0 and farm_size_acres <= 10000)),
  add column if not exists primary_crops text[]
    check (primary_crops is null or cardinality(primary_crops) <= 10),
  add column if not exists organisation_name varchar(120),
  add column if not exists buyer_type varchar(24)
    check (buyer_type is null or buyer_type in
      ('trader', 'wholesaler', 'retailer', 'processor', 'exporter', 'fpo', 'institution', 'other')),
  add column if not exists operator_service_types text[]
    check (operator_service_types is null or operator_service_types <@
      array['transport', 'cold_storage', 'warehouse', 'packhouse']::text[]),
  add column if not exists operator_fleet_size integer
    check (operator_fleet_size is null or (operator_fleet_size >= 0 and operator_fleet_size <= 10000)),
  add column if not exists operator_cold_chain boolean;

-- Vehicle details only make sense when the farmer has their own transport.
alter table public.profiles
  drop constraint if exists profiles_vehicle_requires_own_transport;
alter table public.profiles
  add constraint profiles_vehicle_requires_own_transport check (
    own_transport is true
    or (transport_vehicle_type is null and transport_capacity_quintal is null)
  );

grant update (
  own_transport,
  transport_vehicle_type,
  transport_capacity_quintal,
  farm_size_acres,
  primary_crops,
  organisation_name,
  buyer_type,
  operator_service_types,
  operator_fleet_size,
  operator_cold_chain
) on public.profiles to authenticated;

comment on column public.profiles.own_transport is
  'Farmer-declared: owns or controls a vehicle for taking produce to market.';

-- 2. Access requests for buyer and operator roles.
create table if not exists public.role_access_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  requested_role public.farmess_role not null
    check (requested_role in ('buyer', 'operator')),
  requester_name varchar(80) not null
    check (char_length(btrim(requester_name)) between 2 and 80),
  organisation_name varchar(120) not null
    check (char_length(btrim(organisation_name)) between 2 and 120),
  reason varchar(500) not null
    check (char_length(btrim(reason)) between 20 and 500),
  status varchar(12) not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  reviewed_by_user_id uuid references public.profiles(id) on delete set null,
  review_note varchar(500),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  constraint role_access_requests_review_consistency check (
    (status = 'pending' and reviewed_by_user_id is null and reviewed_at is null)
    or (status <> 'pending' and reviewed_at is not null
        and char_length(btrim(coalesce(review_note, ''))) >= 10)
  )
);

create unique index if not exists role_access_requests_one_pending_per_user
  on public.role_access_requests (user_id) where status = 'pending';
create index if not exists role_access_requests_status_created_idx
  on public.role_access_requests (status, created_at desc);
create index if not exists role_access_requests_reviewer_idx
  on public.role_access_requests (reviewed_by_user_id);

alter table public.role_access_requests enable row level security;

revoke all on public.role_access_requests from public, anon, authenticated;
grant select on public.role_access_requests to authenticated;
grant insert (requested_role, requester_name, organisation_name, reason)
  on public.role_access_requests to authenticated;

-- Requesters see their own requests; trusted admins see all of them.
create policy role_access_requests_select
  on public.role_access_requests
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (
      coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'farmess_role'), '') = 'admin'
      and exists (
        select 1 from public.profiles
        where id = (select auth.uid()) and role = 'admin'
      )
    )
  );

-- Only signed-in farmers may request; the row is always their own and pending.
create policy role_access_requests_insert_own
  on public.role_access_requests
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and status = 'pending'
    and coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'farmess_role'), '') = 'farmer'
  );

-- 3. Admin review. Approval updates both the trusted JWT claim and the profile
-- role atomically. The user must sign in again to receive the new role.
create or replace function public.review_role_access_request(
  p_request_id uuid,
  p_decision text,
  p_review_note text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_request public.role_access_requests%rowtype;
begin
  if v_actor is null
     or coalesce(auth.jwt() -> 'app_metadata' ->> 'farmess_role', '') <> 'admin'
     or not exists (select 1 from public.profiles where id = v_actor and role = 'admin')
  then
    raise exception 'An authorised Farmess admin is required.' using errcode = '42501';
  end if;

  if p_decision not in ('approved', 'rejected') then
    raise exception 'Choose approve or reject.' using errcode = '22023';
  end if;

  if p_review_note is null or char_length(btrim(p_review_note)) < 10
     or char_length(btrim(p_review_note)) > 500 then
    raise exception 'A review note between 10 and 500 characters is required.' using errcode = '22023';
  end if;

  select * into v_request
    from public.role_access_requests
    where id = p_request_id
    for update;

  if not found then
    raise exception 'The access request was not found.' using errcode = 'P0002';
  end if;

  if v_request.status <> 'pending' then
    raise exception 'This request has already been reviewed.' using errcode = '22023';
  end if;

  if v_request.user_id = v_actor then
    raise exception 'Admins cannot review their own request.' using errcode = '42501';
  end if;

  if p_decision = 'approved' then
    -- Only buyer/operator can ever be granted here (enforced by the table check).
    update public.profiles
      set role = v_request.requested_role,
          organisation_name = coalesce(organisation_name, v_request.organisation_name)
      where id = v_request.user_id;

    update auth.users
      set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
        || jsonb_build_object('farmess_role', v_request.requested_role::text)
      where id = v_request.user_id;
  end if;

  update public.role_access_requests
    set status = p_decision,
        reviewed_by_user_id = v_actor,
        review_note = btrim(p_review_note),
        reviewed_at = now()
    where id = p_request_id;

  return jsonb_build_object(
    'request_id', p_request_id,
    'user_id', v_request.user_id,
    'requested_role', v_request.requested_role,
    'decision', p_decision,
    'reviewed_at', now()
  );
end;
$$;

revoke all on function public.review_role_access_request(uuid, text, text) from public, anon, authenticated;
grant execute on function public.review_role_access_request(uuid, text, text) to authenticated;

comment on table public.role_access_requests is
  'Requests from farmer accounts for buyer or operator access; reviewed only by trusted admins. Admin access is never requestable.';
comment on function public.review_role_access_request(uuid, text, text) is
  'Admin-only: approve or reject a buyer/operator access request with a review note; approval updates the profile role and trusted JWT claim together.';
