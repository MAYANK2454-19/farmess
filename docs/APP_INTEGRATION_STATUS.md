# Farmess application integration status

This document separates the existing database foundation from the application flows connected in the current release branch.

## Existing Supabase foundation

The Supabase project already contains the core Farmess schema and row-level security policies. The application tables include profiles and consent audit events, produce lots, market observations, buyer requirements, offers, service listings and requests, notifications, sales and sale activity.

The database owns important invariants: account roles are stored in trusted auth metadata, rows are scoped by participant/owner, a farmer accepting an offer is checked against expiry and available inventory, and the offer lifecycle creates the related sale/activity/notification records.

## Application flows connected on this branch

- Cookie-based Supabase SSR clients, session refresh, sign-in, sign-up, email confirmation, password reset and sign-out.
- Farmer workspace with private produce drafts, inventory listing, profile and privacy preferences, inbox notifications, received offer decisions and sale activity.
- Buyer workspace with own buying requirements, public published-lot discovery, offer creation, sent-offer history and pending-offer withdrawal.
- Service-provider workspace with service listing publication and management, incoming requests and accept/decline decisions.
- Farmer transport/storage discovery and service-request creation.

All writes use authenticated server handlers and the user's session. The server derives owner/provider/participant IDs rather than trusting IDs supplied by the browser. Supabase RLS remains the final data-access boundary.

## Not yet complete

- Trusted buyer and service-provider onboarding/invitation. Public sign-up deliberately creates farmer accounts only; role changes cannot be requested from a browser form.
- Admin/reviewer workspace and its case-authorized workflows.
- Automated matching of buyer requirements to farmer lots and notification campaigns.
- Sale fulfilment workflow beyond agreement capture and recorded activity; payment collection/settlement is not implemented.
- Provider-side contact disclosure, dispatch/fulfilment tracking, live capacity reservation and cancellation lifecycle.
- Production verification of email deliverability, reset templates, allowed redirect URLs and real-user RLS flows.
- Final production deployment of this branch.

Do not represent any item in the last section as a live capability until it is implemented and tested end to end.
