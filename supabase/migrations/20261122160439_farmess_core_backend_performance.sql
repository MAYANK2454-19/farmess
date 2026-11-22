create index offers_lot_farmer_idx on public.offers (lot_id, farmer_id);
create index profile_consent_events_actor_idx on public.profile_consent_events (actor_user_id);
create index sale_activity_actor_idx on public.sale_activity (actor_user_id);
create index sales_lot_farmer_idx on public.sales (lot_id, farmer_id);
create index service_requests_listing_provider_idx
  on public.service_requests (listing_id, provider_user_id);

drop policy offers_withdraw_own on public.offers;
drop policy offers_decide_own_lot on public.offers;
create policy offers_update_participant on public.offers
for update to authenticated
using (
  (
    (select auth.uid()) = buyer_id
    and ((select auth.jwt()) -> 'app_metadata' ->> 'farmess_role') = 'buyer'
    and status = 'pending'
  )
  or
  (
    (select auth.uid()) = farmer_id
    and ((select auth.jwt()) -> 'app_metadata' ->> 'farmess_role') = 'farmer'
    and status = 'pending'
  )
)
with check (
  (
    (select auth.uid()) = buyer_id
    and ((select auth.jwt()) -> 'app_metadata' ->> 'farmess_role') = 'buyer'
    and status = 'withdrawn'
  )
  or
  (
    (select auth.uid()) = farmer_id
    and ((select auth.jwt()) -> 'app_metadata' ->> 'farmess_role') = 'farmer'
    and status in ('accepted', 'declined')
  )
);

drop policy service_listings_public_active on public.service_listings;
drop policy service_listings_select_own on public.service_listings;
create policy service_listings_select_visible on public.service_listings
for select to anon, authenticated
using (
  status = 'active'
  or (
    (select auth.uid()) = operator_id
    and ((select auth.jwt()) -> 'app_metadata' ->> 'farmess_role') = 'operator'
  )
);

drop policy service_requests_provider_decision on public.service_requests;
drop policy service_requests_requester_cancel on public.service_requests;
create policy service_requests_update_participant on public.service_requests
for update to authenticated
using (
  (
    (select auth.uid()) = provider_user_id
    and ((select auth.jwt()) -> 'app_metadata' ->> 'farmess_role') = 'operator'
    and status = 'pending'
  )
  or (
    (select auth.uid()) = requester_id
    and status in ('pending', 'accepted')
  )
)
with check (
  (
    (select auth.uid()) = provider_user_id
    and ((select auth.jwt()) -> 'app_metadata' ->> 'farmess_role') = 'operator'
    and status in ('accepted', 'declined')
  )
  or (
    (select auth.uid()) = requester_id
    and status = 'cancelled'
  )
);

drop policy produce_lots_insert_own on public.produce_lots;
create policy produce_lots_insert_own on public.produce_lots
for insert to authenticated with check (
  (select auth.uid()) = owner_id
  and ((select auth.jwt()) -> 'app_metadata' ->> 'farmess_role') = 'farmer'
);

drop policy buyer_requirements_select_own on public.buyer_requirements;
drop policy buyer_requirements_insert_own on public.buyer_requirements;
drop policy buyer_requirements_update_own on public.buyer_requirements;
drop policy buyer_requirements_delete_own on public.buyer_requirements;
create policy buyer_requirements_select_own on public.buyer_requirements
for select to authenticated using (
  (select auth.uid()) = buyer_id
  and ((select auth.jwt()) -> 'app_metadata' ->> 'farmess_role') = 'buyer'
);
create policy buyer_requirements_insert_own on public.buyer_requirements
for insert to authenticated with check (
  (select auth.uid()) = buyer_id
  and ((select auth.jwt()) -> 'app_metadata' ->> 'farmess_role') = 'buyer'
);
create policy buyer_requirements_update_own on public.buyer_requirements
for update to authenticated using (
  (select auth.uid()) = buyer_id
  and ((select auth.jwt()) -> 'app_metadata' ->> 'farmess_role') = 'buyer'
) with check (
  (select auth.uid()) = buyer_id
  and ((select auth.jwt()) -> 'app_metadata' ->> 'farmess_role') = 'buyer'
);
create policy buyer_requirements_delete_own on public.buyer_requirements
for delete to authenticated using (
  (select auth.uid()) = buyer_id
  and ((select auth.jwt()) -> 'app_metadata' ->> 'farmess_role') = 'buyer'
);

drop policy offers_insert_buyer on public.offers;
create policy offers_insert_buyer on public.offers
for insert to authenticated with check (
  (select auth.uid()) = buyer_id
  and ((select auth.jwt()) -> 'app_metadata' ->> 'farmess_role') = 'buyer'
  and status = 'pending'
);

drop policy service_listings_insert_own on public.service_listings;
drop policy service_listings_update_own on public.service_listings;
drop policy service_listings_delete_own on public.service_listings;
create policy service_listings_insert_own on public.service_listings
for insert to authenticated with check (
  (select auth.uid()) = operator_id
  and ((select auth.jwt()) -> 'app_metadata' ->> 'farmess_role') = 'operator'
);
create policy service_listings_update_own on public.service_listings
for update to authenticated using (
  (select auth.uid()) = operator_id
  and ((select auth.jwt()) -> 'app_metadata' ->> 'farmess_role') = 'operator'
) with check (
  (select auth.uid()) = operator_id
  and ((select auth.jwt()) -> 'app_metadata' ->> 'farmess_role') = 'operator'
);
create policy service_listings_delete_own on public.service_listings
for delete to authenticated using (
  (select auth.uid()) = operator_id
  and ((select auth.jwt()) -> 'app_metadata' ->> 'farmess_role') = 'operator'
);

drop policy service_requests_insert_requester on public.service_requests;
create policy service_requests_insert_requester on public.service_requests
for insert to authenticated with check (
  (select auth.uid()) = requester_id
  and ((select auth.jwt()) -> 'app_metadata' ->> 'farmess_role') in ('farmer', 'buyer')
);
