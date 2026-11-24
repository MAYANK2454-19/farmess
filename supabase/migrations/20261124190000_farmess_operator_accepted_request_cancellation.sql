-- Allow the assigned provider to cancel only an accepted request.
-- The RPC derives the provider identity from the verified Supabase JWT; clients
-- cannot supply a provider ID or arbitrary target status. Existing row triggers
-- continue to create the normal status-change notification/event.
create or replace function public.cancel_accepted_service_request(p_request_id uuid)
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
       set status = 'cancelled'
     where request.id = p_request_id
       and request.provider_user_id = auth.uid()
       and request.status = 'accepted'
    returning request.id, request.status::text, request.updated_at;
end;
$$;

revoke all on function public.cancel_accepted_service_request(uuid) from public, anon;
grant execute on function public.cancel_accepted_service_request(uuid) to authenticated;

comment on function public.cancel_accepted_service_request(uuid) is
  'Atomically cancels an accepted service request for its assigned authenticated operator only.';
