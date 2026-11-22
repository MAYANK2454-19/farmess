create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;

create type public.farmess_role as enum ('farmer', 'buyer', 'operator', 'admin');
create type public.farmer_consent_field as enum (
  'approximate_location_sharing',
  'exact_location_disclosure',
  'buyer_contact_disclosure',
  'provider_contact_disclosure'
);

create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.farmess_role not null default 'farmer',
  display_name varchar(80),
  phone_number varchar(16),
  market_area varchar(160),
  approximate_location_sharing boolean not null default false,
  exact_location_disclosure boolean not null default false,
  buyer_contact_disclosure boolean not null default false,
  provider_contact_disclosure boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_phone_e164 check (
    phone_number is null or phone_number ~ '^\+[1-9][0-9]{7,14}$'
  )
);

create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.farmess_role;
begin
  v_role := case new.raw_app_meta_data ->> 'farmess_role'
    when 'buyer' then 'buyer'::public.farmess_role
    when 'operator' then 'operator'::public.farmess_role
    when 'admin' then 'admin'::public.farmess_role
    else 'farmer'::public.farmess_role
  end;

  insert into public.profiles (id, role)
  values (new.id, v_role)
  on conflict (id) do nothing;

  update auth.users
  set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
    || jsonb_build_object('farmess_role', v_role::text)
  where id = new.id;

  return new;
end;
$$;

revoke all on function private.handle_new_user() from public, anon, authenticated;
revoke all on function private.set_updated_at() from public, anon, authenticated;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user();

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function private.set_updated_at();

create table public.profile_consent_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  consent_field public.farmer_consent_field not null,
  granted boolean not null,
  dedupe_key uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  unique (user_id, dedupe_key)
);

create function private.audit_profile_consent_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_field text;
begin
  foreach v_field in array array[
    'approximate_location_sharing',
    'exact_location_disclosure',
    'buyer_contact_disclosure',
    'provider_contact_disclosure'
  ] loop
    if (to_jsonb(new) -> v_field) is distinct from (to_jsonb(old) -> v_field) then
      insert into public.profile_consent_events (
        user_id, actor_user_id, consent_field, granted
      )
      values (
        new.id,
        auth.uid(),
        v_field::public.farmer_consent_field,
        (to_jsonb(new) ->> v_field)::boolean
      );
    end if;
  end loop;
  return new;
end;
$$;

revoke all on function private.audit_profile_consent_changes() from public, anon, authenticated;

create trigger profiles_audit_consent_changes
after update on public.profiles
for each row execute function private.audit_profile_consent_changes();

create table public.market_observations (
  id uuid primary key default gen_random_uuid(),
  source_name varchar(120) not null,
  source_url text not null check (source_url ~ '^https://'),
  crop varchar(80) not null,
  variety varchar(80),
  market_name varchar(160) not null,
  district varchar(120),
  state varchar(120),
  min_price_paise_per_quintal bigint,
  max_price_paise_per_quintal bigint,
  modal_price_paise_per_quintal bigint,
  observation_date date not null,
  retrieved_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint market_observations_prices_nonnegative check (
    coalesce(min_price_paise_per_quintal, 0) >= 0
    and coalesce(max_price_paise_per_quintal, 0) >= 0
    and coalesce(modal_price_paise_per_quintal, 0) >= 0
  ),
  constraint market_observations_price_order check (
    (min_price_paise_per_quintal is null or max_price_paise_per_quintal is null
      or min_price_paise_per_quintal <= max_price_paise_per_quintal)
    and (modal_price_paise_per_quintal is null or min_price_paise_per_quintal is null
      or modal_price_paise_per_quintal >= min_price_paise_per_quintal)
    and (modal_price_paise_per_quintal is null or max_price_paise_per_quintal is null
      or modal_price_paise_per_quintal <= max_price_paise_per_quintal)
  )
);

create index market_observations_crop_market_date_idx
  on public.market_observations (lower(crop), lower(market_name), observation_date desc);
create index market_observations_retrieved_at_idx
  on public.market_observations (retrieved_at desc);

create table public.produce_lots (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  crop varchar(80) not null,
  variety varchar(80),
  grade varchar(24),
  quantity numeric(14, 3) not null check (quantity > 0),
  unit varchar(16) not null check (unit in ('kg', 'quintal', 'tonne')),
  approximate_area varchar(160) not null,
  available_from date not null,
  sell_by date not null,
  notes varchar(1000),
  status varchar(16) not null default 'draft'
    check (status in ('draft', 'published', 'paused', 'closed', 'sold')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id),
  constraint produce_lots_dates_order check (sell_by >= available_from)
);

create index produce_lots_owner_created_idx on public.produce_lots (owner_id, created_at desc);
create index produce_lots_status_crop_idx on public.produce_lots (status, lower(crop));
create trigger produce_lots_set_updated_at
before update on public.produce_lots
for each row execute function private.set_updated_at();

create table public.buyer_requirements (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  crop varchar(80) not null,
  variety varchar(80),
  grade varchar(24),
  min_quantity numeric(14, 3) not null check (min_quantity > 0),
  max_quantity numeric(14, 3) check (max_quantity is null or max_quantity >= min_quantity),
  unit varchar(16) not null check (unit in ('kg', 'quintal', 'tonne')),
  market_area varchar(160) not null,
  delivery_by date,
  target_price_paise_per_quintal bigint check (
    target_price_paise_per_quintal is null or target_price_paise_per_quintal > 0
  ),
  status varchar(16) not null default 'active'
    check (status in ('active', 'paused', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index buyer_requirements_buyer_created_idx
  on public.buyer_requirements (buyer_id, created_at desc);
create index buyer_requirements_active_crop_idx
  on public.buyer_requirements (status, lower(crop));
create trigger buyer_requirements_set_updated_at
before update on public.buyer_requirements
for each row execute function private.set_updated_at();

create table public.offers (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  farmer_id uuid not null references public.profiles(id) on delete cascade,
  lot_id uuid not null,
  price_paise_per_quintal bigint not null check (price_paise_per_quintal > 0),
  quantity numeric(14, 3) not null check (quantity > 0),
  unit varchar(16) not null check (unit in ('kg', 'quintal', 'tonne')),
  valid_until timestamptz not null,
  terms varchar(1000),
  status varchar(16) not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'withdrawn', 'expired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint offers_no_self_offer check (buyer_id <> farmer_id),
  constraint offers_validity_future check (valid_until > created_at),
  constraint offers_lot_owner_fk foreign key (lot_id, farmer_id)
    references public.produce_lots (id, owner_id) on delete cascade
);

create index offers_buyer_created_idx on public.offers (buyer_id, created_at desc);
create index offers_farmer_created_idx on public.offers (farmer_id, created_at desc);
create index offers_lot_status_idx on public.offers (lot_id, status);
create trigger offers_set_updated_at
before update on public.offers
for each row execute function private.set_updated_at();

create table public.service_listings (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid not null references public.profiles(id) on delete cascade,
  service_type varchar(16) not null check (service_type in ('transport', 'storage')),
  title varchar(120) not null,
  description varchar(1000),
  service_area varchar(160) not null,
  destination_area varchar(160),
  capacity_quantity numeric(14, 3) check (capacity_quantity is null or capacity_quantity > 0),
  capacity_unit varchar(16) check (
    capacity_unit is null or capacity_unit in ('kg', 'quintal', 'tonne')
  ),
  price_paise bigint check (price_paise is null or price_paise >= 0),
  available_from date,
  available_until date,
  status varchar(16) not null default 'active'
    check (status in ('active', 'paused', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, operator_id),
  constraint service_listings_dates_order check (
    available_until is null or available_from is null or available_until >= available_from
  )
);

create index service_listings_operator_created_idx
  on public.service_listings (operator_id, created_at desc);
create index service_listings_type_area_idx
  on public.service_listings (service_type, lower(service_area), status);
create trigger service_listings_set_updated_at
before update on public.service_listings
for each row execute function private.set_updated_at();

create table public.service_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  provider_user_id uuid not null references public.profiles(id) on delete cascade,
  listing_id uuid not null,
  requested_quantity numeric(14, 3) check (
    requested_quantity is null or requested_quantity > 0
  ),
  unit varchar(16) check (unit is null or unit in ('kg', 'quintal', 'tonne')),
  origin_area varchar(160),
  destination_area varchar(160),
  requested_date date,
  message varchar(1000),
  status varchar(16) not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'cancelled', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_requests_no_self_request check (requester_id <> provider_user_id),
  constraint service_requests_listing_provider_fk foreign key (listing_id, provider_user_id)
    references public.service_listings (id, operator_id) on delete cascade
);

create index service_requests_requester_created_idx
  on public.service_requests (requester_id, created_at desc);
create index service_requests_provider_created_idx
  on public.service_requests (provider_user_id, created_at desc);
create trigger service_requests_set_updated_at
before update on public.service_requests
for each row execute function private.set_updated_at();

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references public.profiles(id) on delete cascade,
  event_key varchar(40) not null,
  title varchar(120) not null,
  body varchar(320) not null,
  related_type varchar(32),
  related_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_recipient_created_idx
  on public.notifications (recipient_user_id, created_at desc);
create index notifications_unread_idx
  on public.notifications (recipient_user_id, created_at desc)
  where read_at is null;

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null unique references public.offers(id) on delete restrict,
  buyer_id uuid not null references public.profiles(id) on delete restrict,
  farmer_id uuid not null references public.profiles(id) on delete restrict,
  lot_id uuid not null,
  agreed_price_paise_per_quintal bigint not null check (agreed_price_paise_per_quintal > 0),
  agreed_quantity numeric(14, 3) not null check (agreed_quantity > 0),
  unit varchar(16) not null check (unit in ('kg', 'quintal', 'tonne')),
  status varchar(24) not null default 'agreed'
    check (status in ('agreed', 'dispatched', 'delivered', 'payment_pending', 'paid', 'cancelled')),
  agreed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sales_no_self_sale check (buyer_id <> farmer_id),
  constraint sales_lot_owner_fk foreign key (lot_id, farmer_id)
    references public.produce_lots (id, owner_id) on delete restrict
);

create index sales_buyer_created_idx on public.sales (buyer_id, agreed_at desc);
create index sales_farmer_created_idx on public.sales (farmer_id, agreed_at desc);
create trigger sales_set_updated_at
before update on public.sales
for each row execute function private.set_updated_at();

create table public.sale_activity (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  actor_user_id uuid references public.profiles(id) on delete set null,
  participant_user_ids uuid[] not null,
  event_key varchar(40) not null,
  summary varchar(240) not null,
  created_at timestamptz not null default now()
);

create index sale_activity_sale_created_idx on public.sale_activity (sale_id, created_at desc);
create index sale_activity_participants_gin_idx on public.sale_activity using gin (participant_user_ids);

create function private.enforce_offer_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lot public.produce_lots%rowtype;
  v_offer_kg numeric;
  v_lot_kg numeric;
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

  select * into v_lot
  from public.produce_lots
  where id = new.lot_id and owner_id = new.farmer_id;

  if not found or v_lot.status <> 'published' then
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

  return new;
end;
$$;

create function private.handle_offer_events()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sale_id uuid;
begin
  if tg_op = 'INSERT' then
    insert into public.notifications (recipient_user_id, event_key, title, body, related_type, related_id)
    values (new.farmer_id, 'new_offer', 'New buyer offer',
      'A buyer sent an offer for your produce lot.', 'offer', new.id);
    return new;
  end if;

  if old.status is distinct from new.status then
    if new.status = 'accepted' then
      insert into public.sales (
        offer_id, buyer_id, farmer_id, lot_id,
        agreed_price_paise_per_quintal, agreed_quantity, unit
      )
      values (
        new.id, new.buyer_id, new.farmer_id, new.lot_id,
        new.price_paise_per_quintal, new.quantity, new.unit
      )
      on conflict (offer_id) do nothing;

      select id into v_sale_id from public.sales where offer_id = new.id;

      insert into public.sale_activity (
        sale_id, actor_user_id, participant_user_ids, event_key, summary
      )
      values (
        v_sale_id, auth.uid(), array[new.buyer_id, new.farmer_id],
        'offer_accepted', 'Buyer offer accepted; sale terms recorded.'
      );

      insert into public.notifications (recipient_user_id, event_key, title, body, related_type, related_id)
      values (new.buyer_id, 'offer_accepted', 'Offer accepted',
        'The farmer accepted your offer. Review the agreed sale details.', 'sale', v_sale_id);
    elsif new.status = 'declined' then
      insert into public.notifications (recipient_user_id, event_key, title, body, related_type, related_id)
      values (new.buyer_id, 'offer_declined', 'Offer declined',
        'The farmer declined your offer.', 'offer', new.id);
    elsif new.status = 'withdrawn' then
      insert into public.notifications (recipient_user_id, event_key, title, body, related_type, related_id)
      values (new.farmer_id, 'offer_withdrawn', 'Offer withdrawn',
        'The buyer withdrew an offer for your produce lot.', 'offer', new.id);
    end if;
  end if;
  return new;
end;
$$;

create function private.enforce_service_request_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or auth.uid() <> new.requester_id
    or coalesce(auth.jwt() -> 'app_metadata' ->> 'farmess_role', '') not in ('farmer', 'buyer')
  then
    raise exception 'Only a signed-in farmer or buyer can request a service.';
  end if;

  if not exists (
    select 1 from public.service_listings listing
    join public.profiles provider on provider.id = listing.operator_id
    where listing.id = new.listing_id
      and listing.operator_id = new.provider_user_id
      and listing.status = 'active'
      and provider.role = 'operator'
  ) then
    raise exception 'The selected service listing is not active.';
  end if;

  return new;
end;
$$;

create function private.handle_service_request_events()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.notifications (recipient_user_id, event_key, title, body, related_type, related_id)
    values (new.provider_user_id, 'service_request', 'New service request',
      'A user sent a request for one of your listed services.', 'service_request', new.id);
  elsif old.status is distinct from new.status then
    if new.status in ('accepted', 'declined', 'completed') then
      insert into public.notifications (recipient_user_id, event_key, title, body, related_type, related_id)
      values (new.requester_id, 'service_request_update', 'Service request updated',
        'The service provider updated the status of your request.', 'service_request', new.id);
    elsif new.status = 'cancelled' then
      insert into public.notifications (recipient_user_id, event_key, title, body, related_type, related_id)
      values (new.provider_user_id, 'service_request_cancelled', 'Service request cancelled',
        'The requester cancelled a service request.', 'service_request', new.id);
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_offer_rules() from public, anon, authenticated;
revoke all on function private.handle_offer_events() from public, anon, authenticated;
revoke all on function private.enforce_service_request_rules() from public, anon, authenticated;
revoke all on function private.handle_service_request_events() from public, anon, authenticated;

create trigger offers_enforce_rules
before insert or update on public.offers
for each row execute function private.enforce_offer_rules();
create trigger offers_create_events
after insert or update on public.offers
for each row execute function private.handle_offer_events();
create trigger service_requests_enforce_rules
before insert on public.service_requests
for each row execute function private.enforce_service_request_rules();
create trigger service_requests_create_events
after insert or update on public.service_requests
for each row execute function private.handle_service_request_events();

alter table public.profiles enable row level security;
alter table public.profile_consent_events enable row level security;
alter table public.market_observations enable row level security;
alter table public.produce_lots enable row level security;
alter table public.buyer_requirements enable row level security;
alter table public.offers enable row level security;
alter table public.service_listings enable row level security;
alter table public.service_requests enable row level security;
alter table public.notifications enable row level security;
alter table public.sales enable row level security;
alter table public.sale_activity enable row level security;

create policy profiles_select_own on public.profiles
for select to authenticated using ((select auth.uid()) = id);
create policy profiles_update_own on public.profiles
for update to authenticated using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);
create policy consent_events_select_own on public.profile_consent_events
for select to authenticated using ((select auth.uid()) = user_id);
create policy market_observations_read_public on public.market_observations
for select to anon, authenticated using (true);

create policy produce_lots_select_own on public.produce_lots
for select to authenticated using ((select auth.uid()) = owner_id);
create policy produce_lots_insert_own on public.produce_lots
for insert to authenticated with check (
  (select auth.uid()) = owner_id
  and (select auth.jwt() -> 'app_metadata' ->> 'farmess_role') = 'farmer'
);
create policy produce_lots_update_own on public.produce_lots
for update to authenticated using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);
create policy produce_lots_delete_own on public.produce_lots
for delete to authenticated using ((select auth.uid()) = owner_id);

create policy buyer_requirements_select_own on public.buyer_requirements
for select to authenticated using (
  (select auth.uid()) = buyer_id
  and (select auth.jwt() -> 'app_metadata' ->> 'farmess_role') = 'buyer'
);
create policy buyer_requirements_insert_own on public.buyer_requirements
for insert to authenticated with check (
  (select auth.uid()) = buyer_id
  and (select auth.jwt() -> 'app_metadata' ->> 'farmess_role') = 'buyer'
);
create policy buyer_requirements_update_own on public.buyer_requirements
for update to authenticated using (
  (select auth.uid()) = buyer_id
  and (select auth.jwt() -> 'app_metadata' ->> 'farmess_role') = 'buyer'
) with check (
  (select auth.uid()) = buyer_id
  and (select auth.jwt() -> 'app_metadata' ->> 'farmess_role') = 'buyer'
);
create policy buyer_requirements_delete_own on public.buyer_requirements
for delete to authenticated using (
  (select auth.uid()) = buyer_id
  and (select auth.jwt() -> 'app_metadata' ->> 'farmess_role') = 'buyer'
);

create policy offers_select_participant on public.offers
for select to authenticated using ((select auth.uid()) in (buyer_id, farmer_id));
create policy offers_insert_buyer on public.offers
for insert to authenticated with check (
  (select auth.uid()) = buyer_id
  and (select auth.jwt() -> 'app_metadata' ->> 'farmess_role') = 'buyer'
  and status = 'pending'
);
create policy offers_withdraw_own on public.offers
for update to authenticated using (
  (select auth.uid()) = buyer_id
  and (select auth.jwt() -> 'app_metadata' ->> 'farmess_role') = 'buyer'
  and status = 'pending'
) with check (
  (select auth.uid()) = buyer_id
  and (select auth.jwt() -> 'app_metadata' ->> 'farmess_role') = 'buyer'
  and status = 'withdrawn'
);
create policy offers_decide_own_lot on public.offers
for update to authenticated using (
  (select auth.uid()) = farmer_id
  and (select auth.jwt() -> 'app_metadata' ->> 'farmess_role') = 'farmer'
  and status = 'pending'
) with check (
  (select auth.uid()) = farmer_id
  and (select auth.jwt() -> 'app_metadata' ->> 'farmess_role') = 'farmer'
  and status in ('accepted', 'declined')
);

create policy service_listings_public_active on public.service_listings
for select to anon, authenticated using (status = 'active');
create policy service_listings_select_own on public.service_listings
for select to authenticated using (
  (select auth.uid()) = operator_id
  and (select auth.jwt() -> 'app_metadata' ->> 'farmess_role') = 'operator'
);
create policy service_listings_insert_own on public.service_listings
for insert to authenticated with check (
  (select auth.uid()) = operator_id
  and (select auth.jwt() -> 'app_metadata' ->> 'farmess_role') = 'operator'
);
create policy service_listings_update_own on public.service_listings
for update to authenticated using (
  (select auth.uid()) = operator_id
  and (select auth.jwt() -> 'app_metadata' ->> 'farmess_role') = 'operator'
) with check (
  (select auth.uid()) = operator_id
  and (select auth.jwt() -> 'app_metadata' ->> 'farmess_role') = 'operator'
);
create policy service_listings_delete_own on public.service_listings
for delete to authenticated using (
  (select auth.uid()) = operator_id
  and (select auth.jwt() -> 'app_metadata' ->> 'farmess_role') = 'operator'
);

create policy service_requests_select_participant on public.service_requests
for select to authenticated using ((select auth.uid()) in (requester_id, provider_user_id));
create policy service_requests_insert_requester on public.service_requests
for insert to authenticated with check (
  (select auth.uid()) = requester_id
  and (select auth.jwt() -> 'app_metadata' ->> 'farmess_role') in ('farmer', 'buyer')
);
create policy service_requests_provider_decision on public.service_requests
for update to authenticated using (
  (select auth.uid()) = provider_user_id
  and (select auth.jwt() -> 'app_metadata' ->> 'farmess_role') = 'operator'
  and status = 'pending'
) with check (
  (select auth.uid()) = provider_user_id
  and (select auth.jwt() -> 'app_metadata' ->> 'farmess_role') = 'operator'
  and status in ('accepted', 'declined')
);
create policy service_requests_requester_cancel on public.service_requests
for update to authenticated using (
  (select auth.uid()) = requester_id and status in ('pending', 'accepted')
) with check (
  (select auth.uid()) = requester_id and status = 'cancelled'
);

create policy notifications_select_own on public.notifications
for select to authenticated using ((select auth.uid()) = recipient_user_id);
create policy notifications_update_own on public.notifications
for update to authenticated using ((select auth.uid()) = recipient_user_id)
with check ((select auth.uid()) = recipient_user_id);
create policy sales_select_participant on public.sales
for select to authenticated using ((select auth.uid()) in (buyer_id, farmer_id));
create policy sale_activity_select_participant on public.sale_activity
for select to authenticated using ((select auth.uid()) = any(participant_user_ids));

revoke all on all tables in schema public from anon, authenticated;
grant usage on schema public to anon, authenticated, service_role;

grant select on public.market_observations to anon, authenticated;

grant select on public.profiles to authenticated;
grant update (
  display_name, phone_number, market_area,
  approximate_location_sharing, exact_location_disclosure,
  buyer_contact_disclosure, provider_contact_disclosure
) on public.profiles to authenticated;
grant select on public.profile_consent_events to authenticated;

grant select, delete on public.produce_lots to authenticated;
grant insert (
  owner_id, crop, variety, grade, quantity, unit, approximate_area,
  available_from, sell_by, notes, status
) on public.produce_lots to authenticated;
grant update (
  crop, variety, grade, quantity, unit, approximate_area,
  available_from, sell_by, notes, status
) on public.produce_lots to authenticated;

grant select, delete on public.buyer_requirements to authenticated;
grant insert (
  buyer_id, crop, variety, grade, min_quantity, max_quantity, unit,
  market_area, delivery_by, target_price_paise_per_quintal, status
) on public.buyer_requirements to authenticated;
grant update (
  crop, variety, grade, min_quantity, max_quantity, unit,
  market_area, delivery_by, target_price_paise_per_quintal, status
) on public.buyer_requirements to authenticated;

grant select on public.offers to authenticated;
grant insert (
  buyer_id, farmer_id, lot_id, price_paise_per_quintal,
  quantity, unit, valid_until, terms
) on public.offers to authenticated;
grant update (status) on public.offers to authenticated;

grant select (
  id, operator_id, service_type, title, description, service_area,
  destination_area, capacity_quantity, capacity_unit, price_paise,
  available_from, available_until, status, created_at
) on public.service_listings to anon, authenticated;
grant delete on public.service_listings to authenticated;
grant insert (
  operator_id, service_type, title, description, service_area,
  destination_area, capacity_quantity, capacity_unit, price_paise,
  available_from, available_until, status
) on public.service_listings to authenticated;
grant update (
  service_type, title, description, service_area, destination_area,
  capacity_quantity, capacity_unit, price_paise, available_from,
  available_until, status
) on public.service_listings to authenticated;

grant select on public.service_requests to authenticated;
grant insert (
  requester_id, provider_user_id, listing_id, requested_quantity, unit,
  origin_area, destination_area, requested_date, message
) on public.service_requests to authenticated;
grant update (status) on public.service_requests to authenticated;

grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant select on public.sales, public.sale_activity to authenticated;
grant all privileges on all tables in schema public to service_role;

grant usage on type public.farmess_role, public.farmer_consent_field to authenticated, service_role;

comment on table public.profiles is
  'Private account profile. Role is server-managed and cannot be updated by the user.';
comment on table public.profile_consent_events is
  'Append-only audit trail for farmer consent changes; contains no free-form PII.';
comment on table public.market_observations is
  'Source-attributed reported market prices in INR paise per quintal; public read-only.';
comment on table public.produce_lots is
  'Private farmer-owned produce records; matching summaries are a separate future interface.';
comment on table public.notifications is
  'Recipient-scoped in-app notifications created by trusted database event triggers.';
comment on table public.sale_activity is
  'Participant-scoped immutable sale activity timeline.';
