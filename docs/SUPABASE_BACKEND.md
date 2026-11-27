# FARMESS Supabase backend

This document describes the connected Supabase project and its current application integration. It is a snapshot of the implementation and database state, not a claim that production is populated with real marketplace data.

## Project

- Project reference: `jsfpajiurzabdqbxvype`
- Project: `farmess-team13`
- Region: `ap-northeast-1`
- PostgreSQL: `17.12`
- Vercel project: `farmess`
- Public configuration: `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are configured for Development, Preview and Production.

The browser client uses the publishable key and cookie-aware Supabase SSR integration. Never expose a Supabase secret/service-role key in a `NEXT_PUBLIC_*` variable. Server-side authentication verifies the current user and trusted application role; browser state and signup user metadata are not authorization sources.

## Public schema

The connected project has 16 public application tables:

- **Identity and privacy:** `profiles`, `profile_consent_events`
- **Farmer / buyer marketplace:** `produce_lots`, `buyer_requirements`, `offers`, `sales`, `sale_activity`
- **Logistics:** `service_listings`, `service_requests`, `logistics_recommendation_feedback`
- **Market data and ML governance:** `market_observations`, `market_data_ingestion_runs`, `market_forecast_runs`, `market_forecast_points`, `market_forecast_review_events` (forecast tables kept for the offline research pipeline; the live forecast is computed from `market_observations`)
- **Notifications:** `notifications`

All 16 public tables have Row Level Security enabled. The private ML registry is kept in the `private` schema and is not granted to `anon` or `authenticated` roles. PR #93 adds RLS to that table as defence in depth; that migration must be applied before treating the hardening as active on the connected project.

## Trusted roles and application integration

The trusted role set is `farmer`, `buyer`, `operator` and `admin`. New self-service signups create farmer accounts. Buyer, operator and admin accounts are provisioned separately by trusted project operations. Authorization reads the trusted `app_metadata.farmess_role` claim and checks it against the protected profile role.

The Next.js application currently includes:

- SSR sign-in, farmer signup, email confirmation callback and password-reset/update routes.
- Farmer produce-lot creation, private drafts and publication controls, including approximate-area consent.
- Buyer requirements, lot matching, published-lot marketplace and offer history.
- Operator transport/storage listings and provider-side service requests.
- Participant-scoped notifications, sale activity and profile/privacy management.
- OGD/AGMARKNET market-price search, source-quality diagnostics, date-aware market history, comparison and approved-only forecast display.
- Admin-only mandi imports and audited ingestion history under `/admin/market-data`.
- Optional HeiGIT road-matrix enrichment and farmer-selected locality weather context.

The API endpoints repeat their own role checks; the admin UI is not the security boundary. Database RLS remains authoritative for row access.

## Database-enforced workflows

- Profile preference updates write consent audit events with actor and timestamp.
- Buyer offers are checked against the authenticated buyer, published lot, expiry and available quantity. Lot-level locking and aggregate accepted-quantity checks prevent accepted offers from exceeding published stock.
- Offer acceptance records a sale, sale activity and recipient-scoped notifications.
- Service requests target active provider listings and are visible to requester/provider participants.
- Market observations retain source identity, observation date and retrieval time; admin imports write an ingestion audit record.
- Forecast candidates are private until reviewed. A human approval decision is required before end-user forecast reads can return a run.
- Notifications are recipient-scoped; users can mark their own items as read.

The schema does not process payments and does not claim that an accepted offer means delivery or payment has happened.

## Applied migration ledger

The connected project records these 26 applied migrations (verified 27 November 2026; file versions match the remote ledger):

1. `20261122160345_farmess_core_backend`
2. `20261122160439_farmess_core_backend_performance`
3. `20261122161534_farmess_offer_inventory_integrity`
4. `20261123111751_farmess_logistics_geo_ml_foundation`
5. `20261123112803_farmess_provider_verification_control`
6. `20261123112945_farmess_market_ingestion_admin_controls`
7. `20261123113242_farmess_logistics_radius_matching`
8. `20261123113649_farmess_logistics_feedback_feature_snapshot`
9. `20261123114100_farmess_market_forecast_human_approval`
10. `20261123114338_farmess_buyer_marketplace_safe_view_and_offer_rpc`
11. `20261123114935_farmess_buyer_marketplace_invoker_privileges`
12. `20261123115046_farmess_security_policy_performance_tuning`
13. `20261123115740_farmess_produce_lot_publish_and_area_consent`
14. `20261123120135_farmess_buyer_offer_rpc_read_only_lot_validation`
15. `20261123120834_farmess_buyer_lot_owner_privacy`

16. `20261124143055_farmess_market_forecast_validated_observation_count`
17. `20261124143110_farmess_produce_quality_inspections`
18. `20261124143129_farmess_admin_provider_verification_review`
19. `20261124143144_farmess_operator_accepted_request_cancellation`
20. `20261124143159_farmess_quality_inspection_server_timestamps`
21. `20261124150051_farmess_policy_performance_follow_up`
22. `20261124181458_farmess_role_profiles_and_access_requests`
23. `20261126023347_farmess_profile_location`

24. `20261126044346_farmess_logistics_feedback_road_route`
25. `20261126105309_farmess_contacts_demand_transport_completion`
26. `20261127023511_farmess_auto_import_weather_ratings_sessions` — server-only price and weather
    ingestion (`claim_market_import`, `ingest_market_observations`, `ingest_weather_daily`, token
    hash in `private.server_tokens`), `weather_daily`, `ratings` with `submit_rating` and the
    aggregate-only rating functions, sale steps (`advance_sale`, `my_sales`), and the signed-in
    devices functions (`my_sessions`, `revoke_my_session`)

Before changing schema, link the Supabase CLI to the project, compare local and remote migration history, inspect the diff and apply only reviewed migrations. Do not reset the live project or make untracked DDL edits directly.

## Live data snapshot — 24 November 2026

The latest row-count check found one profile but zero rows in `produce_lots`, `market_observations`, `service_listings`, `service_requests`, `logistics_recommendation_feedback`, `market_data_ingestion_runs`, `market_forecast_runs` and `market_forecast_points`.

Consequences:

- The marketplace and provider directory are connected but not yet populated with real lots or listings.
- Market-price pages show no live data until the owner-created OGD key is supplied and source observations are imported.
- Neither the mandi forecasting pipeline nor logistics preference model has enough genuine training data to produce a deployable model.
- No demo observations or provider entries should be invented to make the application look populated.

## Remaining operational setup

- Supply the owner-generated `DATA_GOV_IN_API_KEY` for mandi imports and `HEIGIT_API_KEY` for optional road routing.
- Weather on Vercel production needs a paid `OPEN_METEO_CUSTOMER_API_KEY`, or `OPEN_METEO_NON_COMMERCIAL_USE=true` when the owner confirms the deployment is non-commercial (free public endpoint).
- Configure a verified-domain SMTP provider separately in Supabase Auth to deliver confirmation and password-reset emails reliably.
- Create and test dedicated farmer, buyer, operator and admin accounts; verify access-denial paths and full user journeys against a new Vercel preview.
- Populate service listings and market observations only from real providers and source-attributed records.
- Apply the PR #93 migration to enable RLS on `private.ml_model_registry`; keep it inaccessible to browser roles and do not add client grants.

The Supabase Free plan does not include leaked-password protection. Basic password length and character-class requirements can be set in Authentication → Sign In / Providers → Email. See the [Supabase password-security guide](https://supabase.com/docs/guides/auth/password-security).

## Useful documents

- `docs/ADMIN_DATA_STEWARD.md` — admin import and forecast review process.
- `docs/EXTERNAL_INTEGRATIONS.md` — API-provider setup and secret configuration.
- `docs/AUTHORIZATION_CONTRACT.md` and `docs/ROUTE_AUTHORIZATION_CONTRACT.md` — application role boundaries.
- `docs/APP_INTEGRATION_STATUS.md` — feature and data readiness notes.
