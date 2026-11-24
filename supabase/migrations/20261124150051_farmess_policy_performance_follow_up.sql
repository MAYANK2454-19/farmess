-- Performance follow-up for policies added on 24 November 2026.
-- Same access rules; auth.jwt() is wrapped as (select auth.jwt()) so Postgres
-- evaluates it once per statement, matching the earlier tuning migration.

-- Produce quality inspections: farmer owner only.
drop policy if exists produce_quality_inspections_select_own on public.produce_quality_inspections;
create policy produce_quality_inspections_select_own
  on public.produce_quality_inspections
  for select to authenticated
  using (
    owner_id = (select auth.uid())
    and coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'farmess_role'), '') = 'farmer'
  );

drop policy if exists produce_quality_inspections_insert_own on public.produce_quality_inspections;
create policy produce_quality_inspections_insert_own
  on public.produce_quality_inspections
  for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and assessor_id = (select auth.uid())
    and coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'farmess_role'), '') = 'farmer'
    and exists (
      select 1
      from public.produce_lots lot
      where lot.id = lot_id
        and lot.owner_id = (select auth.uid())
    )
  );

-- Provider verification audit history: trusted admin only.
drop policy if exists service_listing_verification_events_select_admin
  on public.service_listing_verification_events;
create policy service_listing_verification_events_select_admin
  on public.service_listing_verification_events
  for select to authenticated
  using (
    coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'farmess_role'), '') = 'admin'
    and exists (
      select 1 from public.profiles
      where id = (select auth.uid()) and role = 'admin'
    )
  );

-- Service listings: one permissive SELECT policy instead of two.
-- Visible = active listings, the operator's own listings, or any listing for a
-- trusted admin (previously the separate service_listings_select_admin policy).
-- Roles stay anon + authenticated: anonymous visitors still see active listings only.
drop policy if exists service_listings_select_admin on public.service_listings;
drop policy if exists service_listings_select_visible on public.service_listings;
create policy service_listings_select_visible
  on public.service_listings
  for select to anon, authenticated
  using (
    status::text = 'active'
    or (
      (select auth.uid()) = operator_id
      and coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'farmess_role'), '') = 'operator'
    )
    or (
      coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'farmess_role'), '') = 'admin'
      and exists (
        select 1 from public.profiles
        where id = (select auth.uid()) and role = 'admin'
      )
    )
  );

-- Covering indexes for foreign keys added today.
create index if not exists produce_quality_inspections_lot_owner_idx
  on public.produce_quality_inspections (lot_id, owner_id);

create index if not exists service_listing_verification_events_reviewer_idx
  on public.service_listing_verification_events (reviewed_by_user_id);
