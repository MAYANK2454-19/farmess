alter table public.logistics_recommendation_feedback
  add column if not exists service_radius_match boolean,
  add column if not exists provider_verification_state varchar(24),
  add column if not exists service_type varchar(24),
  add column if not exists rate_basis varchar(24),
  add column if not exists price_paise bigint,
  add column if not exists service_radius_km numeric(7,2);

alter table public.logistics_recommendation_feedback
  drop constraint if exists logistics_feedback_verification_state_check;
alter table public.logistics_recommendation_feedback
  add constraint logistics_feedback_verification_state_check
  check (provider_verification_state is null or provider_verification_state in (
    'unverified','contact_verified','document_verified','platform_verified','suspended'
  ));

alter table public.logistics_recommendation_feedback
  drop constraint if exists logistics_feedback_service_type_check;
alter table public.logistics_recommendation_feedback
  add constraint logistics_feedback_service_type_check
  check (service_type is null or service_type in ('transport','storage'));

alter table public.logistics_recommendation_feedback
  drop constraint if exists logistics_feedback_rate_basis_check;
alter table public.logistics_recommendation_feedback
  add constraint logistics_feedback_rate_basis_check
  check (rate_basis is null or rate_basis in (
    'per_trip','per_km','per_kg','per_quintal','per_tonne','per_day','fixed','quote_required'
  ));

alter table public.logistics_recommendation_feedback
  drop constraint if exists logistics_feedback_price_nonnegative_check;
alter table public.logistics_recommendation_feedback
  add constraint logistics_feedback_price_nonnegative_check
  check (price_paise is null or price_paise >= 0);

alter table public.logistics_recommendation_feedback
  drop constraint if exists logistics_feedback_radius_range_check;
alter table public.logistics_recommendation_feedback
  add constraint logistics_feedback_radius_range_check
  check (service_radius_km is null or (service_radius_km > 0 and service_radius_km <= 500));

comment on table public.logistics_recommendation_feedback is
  'User-scoped preference feedback and a point-in-time feature snapshot. User ratings are not completed-booking labels; actual request outcomes remain in service_requests.';
