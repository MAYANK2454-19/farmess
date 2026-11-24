-- Persist the total validated series size separately from the actual model
-- training split. Historical rows stay NULL because their validated total was
-- not recorded and must not be guessed from the smaller training subset.
alter table public.market_forecast_runs
  add column if not exists validated_observation_count integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'market_forecast_runs_validated_count_check'
      and conrelid = 'public.market_forecast_runs'::regclass
  ) then
    alter table public.market_forecast_runs
      add constraint market_forecast_runs_validated_count_check
      check (
        validated_observation_count is null
        or (
          validated_observation_count >= training_observation_count
          and validated_observation_count >= 0
        )
      );
  end if;
end
$$;

create or replace function private.guard_market_forecast_review()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is not null
     and coalesce(auth.jwt() -> 'app_metadata' ->> 'farmess_role','')='admin'
  then
    if tg_op='INSERT' then
      if new.status<>'candidate'
         or new.created_by_user_id is distinct from auth.uid()
         or new.validated_observation_count is null
         or new.validated_observation_count < 120
         or new.training_observation_count < 90
      then
        raise exception 'A data steward may only create a candidate with at least 120 validated observations and 90 training rows.';
      end if;
    elsif old.status in ('approved','disabled') then
      raise exception 'Published or disabled forecast runs cannot be edited.';
    elsif new.status='approved' then
      if new.reviewed_by_user_id is distinct from auth.uid()
         or nullif(trim(coalesce(new.review_notes,'')),'') is null
         or new.validated_observation_count is null
         or new.validated_observation_count < 120
         or new.training_observation_count < 90
         or new.model_mae_paise_per_quintal is null
         or new.baseline_mae_paise_per_quintal is null
         or new.model_mae_paise_per_quintal >= new.baseline_mae_paise_per_quintal
         or new.model_smape_percent is null
         or new.baseline_smape_percent is null
         or new.model_smape_percent >= new.baseline_smape_percent
      then
        raise exception 'Forecast approval requires 120 validated observations, 90 training rows, a human review note, and improvements over the baseline on MAE and sMAPE.';
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

comment on column public.market_forecast_runs.validated_observation_count is
  'Total unique dated observations validated for this series, including the chronological holdout; NULL means the legacy total was not recorded.';
