-- Contact details between counterparties, buyer demand for farmers, and
-- transport-request completion. All functions run as definer with an empty
-- search_path, check the caller's role, and return only what that caller may see.
--
-- Contact rule: a person's name/organisation is visible to their counterparty in
-- an offer or service request. Phone and email are visible when that person has
-- opted in (profile consent) or once the offer / service request is accepted.

-- 1. Active buyer requirements, for farmers (buyer identity only as consented).
create or replace function public.farmer_buyer_demand()
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
  buyer_email text
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
           case when p.buyer_contact_disclosure then u.email::text end
      from public.buyer_requirements r
      join public.profiles p on p.id = r.buyer_id
      join auth.users u on u.id = r.buyer_id
     where r.status = 'active'
       and (r.delivery_by is null or r.delivery_by >= current_date)
     order by r.created_at desc
     limit 300;
end;
$$;

-- 2. Farmer contact for published lots, for buyers (only farmers who opted in).
create or replace function public.marketplace_lot_contacts(p_lot_ids uuid[])
returns table (lot_id uuid, farmer_name text, farmer_phone text, farmer_email text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null
     or coalesce(auth.jwt() -> 'app_metadata' ->> 'farmess_role', '') <> 'buyer'
  then
    raise exception 'A signed-in buyer account is required.';
  end if;

  return query
    select l.id, nullif(trim(p.display_name), '')::text, p.phone_number::text, u.email::text
      from public.produce_lots l
      join public.profiles p on p.id = l.owner_id
      join auth.users u on u.id = l.owner_id
     where l.id = any(coalesce(p_lot_ids, '{}'))
       and l.status = 'published'
       and p.buyer_contact_disclosure;
end;
$$;

-- 3. Counterparty contact for the caller's offers (farmer <-> buyer).
create or replace function public.offer_contacts()
returns table (
  offer_id uuid,
  counterparty_role text,
  counterparty_name text,
  organisation_name text,
  phone text,
  email text,
  shared_because text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in to view offer contacts.';
  end if;

  return query
    select o.id,
           case when o.farmer_id = auth.uid() then 'buyer' else 'farmer' end,
           nullif(trim(p.display_name), '')::text,
           nullif(trim(p.organisation_name), '')::text,
           case when o.status = 'accepted' or p.buyer_contact_disclosure then p.phone_number::text end,
           case when o.status = 'accepted' or p.buyer_contact_disclosure then u.email::text end,
           case when o.status = 'accepted' then 'accepted'
                when p.buyer_contact_disclosure then 'consent'
                else null end
      from public.offers o
      join public.profiles p
        on p.id = case when o.farmer_id = auth.uid() then o.buyer_id else o.farmer_id end
      join auth.users u on u.id = p.id
     where o.farmer_id = auth.uid() or o.buyer_id = auth.uid();
end;
$$;

-- 4. Counterparty contact for the caller's transport/storage requests.
create or replace function public.service_request_contacts()
returns table (
  request_id uuid,
  counterparty_role text,
  counterparty_name text,
  organisation_name text,
  phone text,
  email text,
  shared_because text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in to view service request contacts.';
  end if;

  return query
    select r.id,
           case when r.provider_user_id = auth.uid() then 'requester' else 'provider' end,
           nullif(trim(p.display_name), '')::text,
           nullif(trim(p.organisation_name), '')::text,
           case when r.status in ('accepted', 'completed') or p.provider_contact_disclosure
                then p.phone_number::text end,
           case when r.status in ('accepted', 'completed') or p.provider_contact_disclosure
                then u.email::text end,
           case when r.status in ('accepted', 'completed') then 'accepted'
                when p.provider_contact_disclosure then 'consent'
                else null end
      from public.service_requests r
      join public.profiles p
        on p.id = case when r.provider_user_id = auth.uid() then r.requester_id else r.provider_user_id end
      join auth.users u on u.id = p.id
     where r.requester_id = auth.uid() or r.provider_user_id = auth.uid();
end;
$$;

-- 5. Provider marks an accepted transport/storage job as completed.
create or replace function public.complete_service_request(p_request_id uuid)
returns table (id uuid, status text, updated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null
     or coalesce(auth.jwt() -> 'app_metadata' ->> 'farmess_role', '') <> 'operator'
  then
    raise exception 'A signed-in service-provider account is required.';
  end if;

  return query
    update public.service_requests as request
       set status = 'completed'
     where request.id = p_request_id
       and request.provider_user_id = auth.uid()
       and request.status = 'accepted'
    returning request.id, request.status::text, request.updated_at;
end;
$$;

-- 6. Notify the right person when a request is cancelled (provider or requester).
create or replace function private.handle_service_request_events()
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
    if new.status in ('accepted', 'declined') then
      insert into public.notifications (recipient_user_id, event_key, title, body, related_type, related_id)
      values (new.requester_id, 'service_request_update', 'Service request updated',
        'The service provider ' || new.status || ' your request.', 'service_request', new.id);
    elsif new.status = 'completed' then
      insert into public.notifications (recipient_user_id, event_key, title, body, related_type, related_id)
      values (new.requester_id, 'service_request_completed', 'Service completed',
        'The service provider marked your request as completed.', 'service_request', new.id);
    elsif new.status = 'cancelled' then
      if auth.uid() = new.provider_user_id then
        insert into public.notifications (recipient_user_id, event_key, title, body, related_type, related_id)
        values (new.requester_id, 'service_request_cancelled', 'Service request cancelled',
          'The service provider cancelled your accepted request.', 'service_request', new.id);
      else
        insert into public.notifications (recipient_user_id, event_key, title, body, related_type, related_id)
        values (new.provider_user_id, 'service_request_cancelled', 'Service request cancelled',
          'The requester cancelled a service request.', 'service_request', new.id);
      end if;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.farmer_buyer_demand() from public, anon;
revoke all on function public.marketplace_lot_contacts(uuid[]) from public, anon;
revoke all on function public.offer_contacts() from public, anon;
revoke all on function public.service_request_contacts() from public, anon;
revoke all on function public.complete_service_request(uuid) from public, anon;
grant execute on function public.farmer_buyer_demand() to authenticated;
grant execute on function public.marketplace_lot_contacts(uuid[]) to authenticated;
grant execute on function public.offer_contacts() to authenticated;
grant execute on function public.service_request_contacts() to authenticated;
grant execute on function public.complete_service_request(uuid) to authenticated;
revoke all on function private.handle_service_request_events() from public, anon, authenticated;
