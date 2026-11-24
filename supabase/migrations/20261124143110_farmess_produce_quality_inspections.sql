-- Farmer-owned, append-only produce quality observations.
create table public.produce_quality_inspections (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null,
  owner_id uuid not null,
  assessor_id uuid not null,
  inspected_at timestamptz not null,
  checks jsonb not null default '{}'::jsonb,
  observations text not null default '',
  status text not null check (status in ('incomplete', 'needs_attention', 'checks_complete')),
  completed_checks smallint not null check (completed_checks between 0 and 6),
  total_checks smallint not null default 6 check (total_checks = 6),
  issues text[] not null default '{}',
  created_at timestamptz not null default now(),
  constraint produce_quality_inspections_lot_owner_fk
    foreign key (lot_id, owner_id)
    references public.produce_lots (id, owner_id)
    on delete cascade,
  constraint produce_quality_inspections_assessor_owner_check
    check (assessor_id = owner_id),
  constraint produce_quality_inspections_checks_object
    check (jsonb_typeof(checks) = 'object'),
  constraint produce_quality_inspections_observations_length
    check (char_length(observations) <= 1000)
);

create index produce_quality_inspections_owner_lot_date_idx
  on public.produce_quality_inspections (owner_id, lot_id, inspected_at desc);

alter table public.produce_quality_inspections enable row level security;

revoke all on public.produce_quality_inspections from anon, authenticated;
grant select, insert on public.produce_quality_inspections to authenticated;

create policy produce_quality_inspections_select_own
  on public.produce_quality_inspections
  for select to authenticated
  using (
    owner_id = (select auth.uid())
    and (select auth.jwt() -> 'app_metadata' ->> 'farmess_role') = 'farmer'
  );

create policy produce_quality_inspections_insert_own
  on public.produce_quality_inspections
  for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and assessor_id = (select auth.uid())
    and (select auth.jwt() -> 'app_metadata' ->> 'farmess_role') = 'farmer'
    and exists (
      select 1
      from public.produce_lots lot
      where lot.id = lot_id
        and lot.owner_id = (select auth.uid())
    )
  );

comment on table public.produce_quality_inspections is
  'Append-only farmer-entered produce quality observations; not an independent grade or food-safety certification.';
