-- Consolidate role/visibility reads and index audit foreign keys.
-- Keep this migration after market-data ingestion and forecast-review foundations.
drop policy if exists market_forecast_runs_read_approved on public.market_forecast_runs;
drop policy if exists market_forecast_runs_admin_select on public.market_forecast_runs;
create policy market_forecast_runs_read_approved_or_admin
  on public.market_forecast_runs
  for select to anon,authenticated
  using (
    status='approved'
    or coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'farmess_role'),'')='admin'
  );

drop policy if exists market_forecast_points_read_approved on public.market_forecast_points;
drop policy if exists market_forecast_points_admin_select on public.market_forecast_points;
create policy market_forecast_points_read_approved_or_admin
  on public.market_forecast_points
  for select to anon,authenticated
  using (
    exists (
      select 1 from public.market_forecast_runs run
      where run.id=forecast_run_id
        and (
          run.status='approved'
          or coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'farmess_role'),'')='admin'
        )
    )
  );

drop policy if exists market_observations_admin_insert on public.market_observations;
create policy market_observations_admin_insert
  on public.market_observations for insert to authenticated
  with check (coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'farmess_role'),'')='admin');
drop policy if exists market_observations_admin_update on public.market_observations;
create policy market_observations_admin_update
  on public.market_observations for update to authenticated
  using (coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'farmess_role'),'')='admin')
  with check (coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'farmess_role'),'')='admin');

drop policy if exists market_data_ingestion_runs_admin_select on public.market_data_ingestion_runs;
create policy market_data_ingestion_runs_admin_select
  on public.market_data_ingestion_runs for select to authenticated
  using (coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'farmess_role'),'')='admin');
drop policy if exists market_data_ingestion_runs_admin_insert on public.market_data_ingestion_runs;
create policy market_data_ingestion_runs_admin_insert
  on public.market_data_ingestion_runs for insert to authenticated
  with check (
    (select auth.uid())=actor_user_id
    and coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'farmess_role'),'')='admin'
  );

drop policy if exists market_forecast_runs_admin_insert on public.market_forecast_runs;
create policy market_forecast_runs_admin_insert
  on public.market_forecast_runs for insert to authenticated
  with check (
    coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'farmess_role'),'')='admin'
    and created_by_user_id=(select auth.uid())
    and status='candidate'
  );
drop policy if exists market_forecast_runs_admin_update on public.market_forecast_runs;
create policy market_forecast_runs_admin_update
  on public.market_forecast_runs for update to authenticated
  using (coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'farmess_role'),'')='admin')
  with check (
    coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'farmess_role'),'')='admin'
    and reviewed_by_user_id=(select auth.uid())
    and status in ('approved','rejected','disabled')
  );
drop policy if exists market_forecast_runs_admin_delete_candidate on public.market_forecast_runs;
create policy market_forecast_runs_admin_delete_candidate
  on public.market_forecast_runs for delete to authenticated
  using (
    coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'farmess_role'),'')='admin'
    and status='candidate'
  );

drop policy if exists market_forecast_points_admin_insert on public.market_forecast_points;
create policy market_forecast_points_admin_insert
  on public.market_forecast_points for insert to authenticated
  with check (exists (
    select 1 from public.market_forecast_runs run
    where run.id=forecast_run_id and run.status='candidate'
      and run.created_by_user_id=(select auth.uid())
      and coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'farmess_role'),'')='admin'
  ));
drop policy if exists market_forecast_points_admin_delete on public.market_forecast_points;
create policy market_forecast_points_admin_delete
  on public.market_forecast_points for delete to authenticated
  using (exists (
    select 1 from public.market_forecast_runs run
    where run.id=forecast_run_id and run.status='candidate'
      and coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'farmess_role'),'')='admin'
  ));

drop policy if exists market_forecast_review_events_admin_select on public.market_forecast_review_events;
create policy market_forecast_review_events_admin_select
  on public.market_forecast_review_events for select to authenticated
  using (coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'farmess_role'),'')='admin');

drop policy if exists produce_lots_select_own on public.produce_lots;
create policy produce_lots_select_own
  on public.produce_lots for select to authenticated
  using (
    (select auth.uid())=owner_id
    and coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'farmess_role'),'')='farmer'
  );

create index if not exists market_data_ingestion_runs_actor_user_idx
  on public.market_data_ingestion_runs(actor_user_id);
create index if not exists market_forecast_review_events_actor_user_idx
  on public.market_forecast_review_events(actor_user_id);
create index if not exists market_forecast_runs_created_by_idx
  on public.market_forecast_runs(created_by_user_id);
create index if not exists market_forecast_runs_reviewed_by_idx
  on public.market_forecast_runs(reviewed_by_user_id);

notify pgrst,'reload schema';
