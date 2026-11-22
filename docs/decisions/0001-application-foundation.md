# ADR 0001 — Initial application foundation

- **Date:** 2026-11-22
- **Status:** Accepted for the initial build
- **Decision owners:** Mayank (team lead), with team review pending

## Decision

Start with one modular Next.js App Router application using TypeScript and Tailwind CSS. Keep UI, feature modules, server/API boundaries, database migrations and domain logic separated by responsibility. Use Supabase Auth and Postgres as the planned persistence platform, but do not wire secrets or create schema until the backend owner provisions the shared project and reviews migrations/RLS.

## Reason

The product scope is broad but the team has six contributors. A single modular application reduces deployment and integration overhead while preserving clear feature boundaries.

## Consequences

- Shared app shell and route conventions can be implemented first.
- Feature owners can ship small branches without scaffolding duplicate apps.
- No fake price, buyer, provider or saved-lot data is displayed.
- The first build preview is not a production-ready farmer service until authentication, persistence, RLS and data-source validation are complete.
- Visual parity remains pending a live Figma frame review because the connected Figma MCP account was rate-limited during this bootstrap.
