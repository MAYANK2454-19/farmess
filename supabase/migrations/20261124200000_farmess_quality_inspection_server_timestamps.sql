-- Quality inspections must carry server time, not a client-supplied timestamp.
-- The API already sends the current time, but RLS allows an authenticated farmer
-- to insert directly through PostgREST, so the database enforces it too.
create or replace function private.set_quality_inspection_server_times()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.inspected_at := now();
  new.created_at := now();
  return new;
end;
$$;

revoke all on function private.set_quality_inspection_server_times() from public, anon, authenticated;

create trigger produce_quality_inspections_server_times
before insert on public.produce_quality_inspections
for each row execute function private.set_quality_inspection_server_times();

alter table public.produce_quality_inspections
  alter column inspected_at set default now();

comment on trigger produce_quality_inspections_server_times on public.produce_quality_inspections is
  'Stamps inspected_at and created_at with server time so inspection history cannot be backdated.';
