alter table public.logistics_recommendation_feedback
  add column if not exists road_distance_meters integer,
  add column if not exists drive_duration_seconds integer;

alter table public.logistics_recommendation_feedback
  drop constraint if exists logistics_feedback_road_distance_check;
alter table public.logistics_recommendation_feedback
  add constraint logistics_feedback_road_distance_check
  check (road_distance_meters is null or (road_distance_meters >= 0 and road_distance_meters <= 1000000));

alter table public.logistics_recommendation_feedback
  drop constraint if exists logistics_feedback_drive_duration_check;
alter table public.logistics_recommendation_feedback
  add constraint logistics_feedback_drive_duration_check
  check (drive_duration_seconds is null or (drive_duration_seconds >= 0 and drive_duration_seconds <= 86400));

comment on column public.logistics_recommendation_feedback.road_distance_meters is
  'HeiGIT road distance shown to the farmer for this recommendation, if a route was available. Feature for the offline logistics ranker.';
comment on column public.logistics_recommendation_feedback.drive_duration_seconds is
  'HeiGIT estimated drive time shown to the farmer for this recommendation, if a route was available.';
