create unique index if not exists market_observations_source_natural_key
  on public.market_observations (
    crop,
    variety,
    state,
    district,
    market_name,
    observation_date,
    source_name
  ) nulls not distinct;

create table if not exists public.market_data_ingestion_runs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.profiles(id) on delete set null,
  source_name varchar(120) not null,
  status varchar(24) not null check (status in ('available','stale','no-data','unavailable','partial')),
  request_filters jsonb not null default '{}'::jsonb,
  records_received integer not null default 0 check (records_received>=0),
  records_upserted integer not null default 0 check (records_upserted>=0),
  error_message varchar(500),
  started_at timestamptz not null default now(),
  completed_at timestamptz not null default now()
);

create index if not exists market_data_ingestion_runs_created_idx
  on public.market_data_ingestion_runs(completed_at desc);

alter table public.market_data_ingestion_runs enable row level security;

create policy market_data_ingestion_runs_admin_select
  on public.market_data_ingestion_runs
  for select to authenticated
  using ((select auth.jwt() -> 'app_metadata' ->> 'farmess_role')='admin');

create policy market_data_ingestion_runs_admin_insert
  on public.market_data_ingestion_runs
  for insert to authenticated
  with check (
    (select auth.uid())=actor_user_id
    and (select auth.jwt() -> 'app_metadata' ->> 'farmess_role')='admin'
  );

create policy market_observations_admin_insert
  on public.market_observations
  for insert to authenticated
  with check ((select auth.jwt() -> 'app_metadata' ->> 'farmess_role')='admin');

create policy market_observations_admin_update
  on public.market_observations
  for update to authenticated
  using ((select auth.jwt() -> 'app_metadata' ->> 'farmess_role')='admin')
  with check ((select auth.jwt() -> 'app_metadata' ->> 'farmess_role')='admin');

grant select on public.market_data_ingestion_runs to authenticated;
grant insert on public.market_data_ingestion_runs to authenticated;
grant insert on public.market_observations to authenticated;
grant update (
  crop,
  variety,
  district,
  state,
  market_name,
  min_price_paise_per_quintal,
  max_price_paise_per_quintal,
  modal_price_paise_per_quintal,
  observation_date,
  retrieved_at,
  source_name,
  source_url
) on public.market_observations to authenticated;

comment on table public.market_data_ingestion_runs is
  'Auditable admin-only log of validated market-data imports. It records counts and outcomes, not API keys.';
comment on index public.market_observations_source_natural_key is
  'Prevents duplicate source observations, including rows with null variety or geography fields.';
