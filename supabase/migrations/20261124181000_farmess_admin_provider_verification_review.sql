create table public.service_listing_verification_events (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.service_listings(id) on delete restrict,
  reviewed_by_user_id uuid not null references public.profiles(id) on delete restrict,
  previous_state varchar(24) not null
    check (previous_state in ('unverified','contact_verified','document_verified','platform_verified','suspended')),
  new_state varchar(24) not null
    check (new_state in ('unverified','contact_verified','document_verified','platform_verified','suspended')),
  review_note varchar(500) not null
    check (char_length(btrim(review_note)) between 20 and 500),
  created_at timestamptz not null default now()
);

create index service_listing_verification_events_listing_created_idx
  on public.service_listing_verification_events (listing_id, created_at desc);

alter table public.service_listing_verification_events enable row level security;

create policy service_listings_select_admin
on public.service_listings
for select to authenticated
using (
  (select auth.jwt() -> 'app_metadata' ->> 'farmess_role') = 'admin'
  and exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  )
);

create policy service_listing_verification_events_select_admin
on public.service_listing_verification_events
for select to authenticated
using (
  (select auth.jwt() -> 'app_metadata' ->> 'farmess_role') = 'admin'
  and exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  )
);

revoke all on table public.service_listing_verification_events from public, anon, authenticated;
grant select on table public.service_listing_verification_events to authenticated;

create or replace function public.review_service_listing_verification(
  p_listing_id uuid,
  p_verification_state text,
  p_review_note text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_previous_state text;
  v_updated_at timestamptz;
  v_event_id uuid;
begin
  v_actor := auth.uid();

  if v_actor is null
     or coalesce(auth.jwt() -> 'app_metadata' ->> 'farmess_role', '') <> 'admin'
     or not exists (
       select 1 from public.profiles
       where id = v_actor and role = 'admin'
     )
  then
    raise exception 'An authorised Farmess admin is required.'
      using errcode = '42501';
  end if;

  if p_verification_state not in (
    'unverified', 'contact_verified', 'document_verified',
    'platform_verified', 'suspended'
  ) then
    raise exception 'Choose a supported provider verification state.'
      using errcode = '22023';
  end if;

  if p_review_note is null
     or char_length(btrim(p_review_note)) < 20
     or char_length(btrim(p_review_note)) > 500
  then
    raise exception 'A review note between 20 and 500 characters is required.'
      using errcode = '22023';
  end if;

  select verification_state
    into v_previous_state
    from public.service_listings
    where id = p_listing_id
    for update;

  if not found then
    raise exception 'The provider listing was not found.'
      using errcode = 'P0002';
  end if;

  if v_previous_state = p_verification_state then
    raise exception 'Choose a different verification state.'
      using errcode = '22023';
  end if;

  update public.service_listings
    set verification_state = p_verification_state
    where id = p_listing_id
    returning updated_at into v_updated_at;

  insert into public.service_listing_verification_events (
    listing_id, reviewed_by_user_id, previous_state, new_state, review_note
  )
  values (
    p_listing_id, v_actor, v_previous_state, p_verification_state, btrim(p_review_note)
  )
  returning id into v_event_id;

  return jsonb_build_object(
    'event_id', v_event_id,
    'listing_id', p_listing_id,
    'previous_state', v_previous_state,
    'new_state', p_verification_state,
    'reviewed_at', now(),
    'listing_updated_at', v_updated_at
  );
end;
$$;

revoke all on function public.review_service_listing_verification(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.review_service_listing_verification(uuid, text, text)
  to authenticated;

comment on table public.service_listing_verification_events is
  'Append-only audit history for trusted admin provider-listing verification decisions.';
comment on function public.review_service_listing_verification(uuid, text, text) is
  'Admin-only atomic provider verification update with a required review note and audit event.';
