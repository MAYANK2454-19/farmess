revoke insert (verification_state) on public.service_listings from authenticated;
revoke update (verification_state) on public.service_listings from authenticated;

create or replace function private.protect_service_listing_verification_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null
     and coalesce(auth.jwt() -> 'app_metadata' ->> 'farmess_role', '') = 'operator'
  then
    if tg_op = 'INSERT' then
      new.verification_state := 'unverified';
    elsif new.verification_state is distinct from old.verification_state then
      raise exception 'Provider verification state is managed by Farmess.';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.protect_service_listing_verification_state() from public, anon, authenticated;

drop trigger if exists service_listing_verification_guard on public.service_listings;
create trigger service_listing_verification_guard
before insert or update of verification_state on public.service_listings
for each row execute function private.protect_service_listing_verification_state();

comment on function private.protect_service_listing_verification_state() is
  'Prevents provider accounts from granting or editing their own verification status; only trusted platform operations can update it.';
