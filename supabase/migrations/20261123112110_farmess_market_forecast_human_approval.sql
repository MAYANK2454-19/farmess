alter table public.market_forecast_runs
  add column if not exists created_by_user_id uuid references public.profiles(id) on delete set null,
  add column if not exists reviewed_by_user_id uuid references public.profiles(id) on delete set null,
  add column if not exists review_notes varchar(1000);

create table if not exists public.market_forecast_review_events (
  id uuid primary key default gen_random_uuid(),
  forecast_run_id uuid not null references public.market_forecast_runs(id) on delete cascade,
  actor_user_id uuid references public.profiles(id) on delete set null,
  previous_status varchar(24),
  new_status varchar(24) not null,
  review_note varchar(1000),
  created_at timestamptz not null default now()
);
create index if not exists market_forecast_review_events_run_idx
  on public.market_forecast_review_events(forecast_run_id,created_at desc);
alter table public.market_forecast_review_events enable row level security;

create policy market_forecast_runs_admin_select on public.market_forecast_runs
  for select to authenticated
  using ((select auth.jwt() -> 'app_metadata' ->> 'farmess_role')='admin');
create policy market_forecast_runs_admin_insert on public.market_forecast_runs
  for insert to authenticated
  with check (
    (select auth.jwt() -> 'app_metadata' ->> 'farmess_role')='admin'
    and created_by_user_id=(select auth.uid())
    and status='candidate'
  );
create policy market_forecast_runs_admin_update on public.market_forecast_runs
  for update to authenticated
  using ((select auth.jwt() -> 'app_metadata' ->> 'farmess_role')='admin')
  with check (
    (select auth.jwt() -> 'app_metadata' ->> 'farmess_role')='admin'
    and reviewed_by_user_id=(select auth.uid())
    and status in ('approved','rejected','disabled')
  );
create policy market_forecast_runs_admin_delete_candidate on public.market_forecast_runs
  for delete to authenticated
  using (
    (select auth.jwt() -> 'app_metadata' ->> 'farmess_role')='admin'
    and status='candidate'
  );

create policy market_forecast_points_admin_select on public.market_forecast_points
  for select to authenticated
  using (exists (
    select 1 from public.market_forecast_runs run
    where run.id=forecast_run_id
      and (select auth.jwt() -> 'app_metadata' ->> 'farmess_role')='admin'
  ));
create policy market_forecast_points_admin_insert on public.market_forecast_points
  for insert to authenticated
  with check (exists (
    select 1 from public.market_forecast_runs run
    where run.id=forecast_run_id and run.status='candidate'
      and (select auth.jwt() -> 'app_metadata' ->> 'farmess_role')='admin'
      and run.created_by_user_id=(select auth.uid())
  ));
create policy market_forecast_points_admin_delete on public.market_forecast_points
  for delete to authenticated
  using (exists (
    select 1 from public.market_forecast_runs run
    where run.id=forecast_run_id and run.status='candidate'
      and (select auth.jwt() -> 'app_metadata' ->> 'farmess_role')='admin'
  ));

create policy market_forecast_review_events_admin_select on public.market_forecast_review_events
  for select to authenticated
  using ((select auth.jwt() -> 'app_metadata' ->> 'farmess_role')='admin');

create or replace function private.guard_market_forecast_review()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is not null
     and coalesce(auth.jwt() -> 'app_metadata' ->> 'farmess_role','')='admin'
  then
    if tg_op='INSERT' then
      if new.status<>'candidate' or new.created_by_user_id is distinct from auth.uid() then
        raise exception 'A data steward may only create a candidate forecast run.';
      end if;
    elsif old.status in ('approved','disabled') then
      raise exception 'Published or disabled forecast runs cannot be edited.';
    elsif new.status='approved' then
      if new.reviewed_by_user_id is distinct from auth.uid()
         or nullif(trim(coalesce(new.review_notes,'')),'') is null
         or new.training_observation_count < 90
         or new.model_mae_paise_per_quintal is null
         or new.baseline_mae_paise_per_quintal is null
         or new.model_mae_paise_per_quintal >= new.baseline_mae_paise_per_quintal
         or new.model_smape_percent is null
         or new.baseline_smape_percent is null
         or new.model_smape_percent >= new.baseline_smape_percent
      then
        raise exception 'Forecast approval requires 90 observations, a human review note, and improvements over the baseline on MAE and sMAPE.';
      end if;
      new.approved_at := now();
    elsif new.status in ('rejected','disabled') then
      if new.reviewed_by_user_id is distinct from auth.uid()
         or nullif(trim(coalesce(new.review_notes,'')),'') is null
      then
        raise exception 'A human review note is required for this forecast decision.';
      end if;
      new.approved_at := null;
    else
      raise exception 'Only candidate, approved, rejected or disabled review transitions are permitted.';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.guard_market_forecast_review() from public,anon,authenticated;
drop trigger if exists market_forecast_review_guard on public.market_forecast_runs;
create trigger market_forecast_review_guard
before insert or update on public.market_forecast_runs
for each row execute function private.guard_market_forecast_review();

create or replace function private.audit_market_forecast_review()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op='INSERT' then
    insert into public.market_forecast_review_events(
      forecast_run_id,actor_user_id,previous_status,new_status,review_note
    ) values (
      new.id,coalesce(auth.uid(),new.created_by_user_id),null,new.status,new.review_notes
    );
  elsif old.status is distinct from new.status then
    insert into public.market_forecast_review_events(
      forecast_run_id,actor_user_id,previous_status,new_status,review_note
    ) values (
      new.id,coalesce(auth.uid(),new.reviewed_by_user_id),old.status,new.status,new.review_notes
    );
  end if;
  return new;
end;
$$;
revoke all on function private.audit_market_forecast_review() from public,anon,authenticated;
drop trigger if exists market_forecast_review_audit on public.market_forecast_runs;
create trigger market_forecast_review_audit
after insert or update on public.market_forecast_runs
for each row execute function private.audit_market_forecast_review();

grant select,insert,update,delete on public.market_forecast_runs to authenticated;
grant select,insert,delete on public.market_forecast_points to authenticated;
grant select on public.market_forecast_review_events to authenticated;
notify pgrst,'reload schema';
