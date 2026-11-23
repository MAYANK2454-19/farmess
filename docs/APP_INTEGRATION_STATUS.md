# Farmess application integration status

This document distinguishes connected application flows from capabilities that still require real data, role provisioning, external verification or end-to-end testing.

## Database and authentication

The team Supabase project contains the core Farmess schema, Postgres/PostGIS functions and RLS policies. The schema includes profiles and consent audit events, produce lots, source-attributed market observations, buyer requirements, offers, service listings and requests, notifications, sales, sale activity, logistics feedback, market ingestion runs, forecast runs/points and forecast review events.

All inspected public tables have RLS enabled. User role checks use trusted Auth `app_metadata`; the browser cannot select its own privileged role. Cookie-based Supabase SSR clients and the Next.js 16 `proxy.ts` refresh flow are used. The server resolves the authenticated session and checks that the profile role matches the trusted role metadata.

The application branch connects the following flows to authenticated server handlers and the Supabase database:

- Sign-up, sign-in, email callback, password recovery, password update and sign-out.
- Farmer-owned produce drafts and inventory reads.
- Buyer requirements, safe published-lot projection, offer creation/history/withdrawal and farmer offer decisions.
- Operator service listing management and provider request acceptance/decline.
- Farmer transport/storage discovery and service-request creation.
- Profile preferences, consent audit events, notifications and sale activity.

Writes derive owner, requester, provider and participant identities from the authenticated session. RLS and database constraints remain the final authorization boundary. The buyer API cannot select the farmer's `owner_id` column. Offer creation uses one narrowly scoped `SECURITY DEFINER` RPC, `public.create_buyer_offer`, which checks the trusted buyer role, published-lot state, quantity, unit and expiry; its search path is empty and execution is revoked from PUBLIC/anon. Supabase's security advisor still warns because authenticated users can execute a definer function, so keep this RPC limited to the validated operation and review any changes carefully.

The private `private.ml_model_registry` table is currently in a schema that has no USAGE grant for anon/authenticated and no table SELECT grant for those roles; the service role has access. However, Supabase reports its RLS flag is disabled. Before any client-facing access is added, agree the service/admin policy and enable RLS. The proposed RLS statement is `ALTER TABLE private.ml_model_registry ENABLE ROW LEVEL SECURITY;`; it has deliberately not been applied automatically without agreed policies.

## Market data and price forecasting

- `GET /api/market-prices` uses the server-side market-data adapter and preserves source status/provenance in the response.
- `POST /api/market-data/refresh` is admin-only. It validates normalized source observations, converts INR to paise, upserts dated records and records an ingestion audit entry.
- `GET /api/market-forecasts` returns only approved forecast runs. Without an approved run, the API reports insufficient data rather than inventing a forecast.
- `ml/market_forecast/train.py` is an offline HistGradientBoosting candidate pipeline. It groups dated observations by crop/variety/geography/market, requires at least 90 unique observations in a series, uses a chronological holdout and must beat a last-observation baseline on both MAE and sMAPE. Candidate forecasts require a separate human review before publication.

**There is no trained market-forecast model or approved forecast at this time.** The database had no market observations when inspected. A market-data steward/admin account and a permitted, functioning data source are needed before this pipeline can be trained.

## Locality-aware logistics support

- `GET /api/logistics/discover` requires a signed-in farmer and explicit latitude/longitude supplied after the user chooses to share their location.
- The database function `find_nearby_service_listings` uses PostGIS distance filtering and supports a configurable search radius, transport/storage type, crop, quantity/unit, required date and cold-chain requirement.
- `src/features/logistics/recommendations.ts` currently uses an explainable `rules-v1` heuristic. It scores proximity, capacity, crop suitability, date, cold chain, provider verification, pricing transparency and service coverage. Each recommendation reports reasons and unknowns; a recommendation is not a confirmed booking.
- `logistics_recommendation_feedback` records a point-in-time feature snapshot and explicit feedback.
- `ml/logistics_ranker/train.py` is an offline candidate model for explicit recommendation usefulness ratings. It requires at least 300 clear non-neutral labels, 30 distinct users and 20 distinct listings, with a chronological evaluation. User and provider IDs are excluded from model features; a candidate is not automatically deployed.

**The logistics ML model is not trained or served.** The database had no provider listings or recommendation feedback when inspected. The live map can only locate active, real provider listings after operators add and maintain their service locations. No local transporter, cold store, availability or price should be invented.

## Buyer-lot matching and net-realisation decisions

Buyer requirement matching is currently deterministic rule-based matching on crop, variety/grade, compatible quantity/unit, locality text and dates. Its response identifies the method as `deterministic-rule-match`; it does not claim a sale probability. Net-realisation comparison remains an explainable calculation from explicit price and cost inputs. Missing costs must remain unknown, not silently become zero.

## Known gaps before production readiness

- Trusted buyer/operator onboarding and invitation, plus an admin/data-steward management workspace.
- Real-user end-to-end verification of sign-up, email delivery, reset links and role-scoped RLS on the team's Supabase Auth configuration.
- A verified directory and onboarding process for transport and storage providers; listing availability must be reconfirmed by the provider.
- Better buyer-lot matching signals and persistent matching/notification campaigns.
- Provider contact disclosure with explicit farmer consent, dispatch/fulfilment milestones, capacity reservation and cancellation handling.
- Sale/payment evidence capture beyond the current agreement/activity record. Farmess does not process payments.
- Market-data source availability, permitted API access, regular ingestion and enough validated observations to evaluate forecasts.
- Enough representative logistics feedback and actual service-request outcomes to validate a learning-to-rank model. Explicit preference feedback is not the same as successful service completion.
- Enable RLS and define least-privilege policies for the private model registry before exposing it to any client-facing role.
- Production deployment and full unit, integration, RLS-denial and end-to-end test evidence for this integrated branch.

Do not present any item in this section as a completed live capability until it has been implemented and tested end to end.
