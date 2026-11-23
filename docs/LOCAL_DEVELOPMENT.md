# Local development

This guide runs the Farmess Next.js app and its API routes on your computer, using the team's existing Supabase project for Auth and PostgreSQL. It does **not** start a separate local Postgres/Supabase stack.

## Requirements

- Node.js 22 or newer
- npm (included with Node.js)
- Git

## 1. Check out the integrated backend branch

From an existing clone of `MAYANK2454-19/farmess`:

```powershell
git fetch origin refs/pull/60/head:refs/remotes/origin/pr-60
git switch --detach refs/remotes/origin/pr-60
```

If you do not have the repository yet:

```powershell
git clone https://github.com/MAYANK2454-19/farmess.git
cd farmess
git fetch origin refs/pull/60/head:refs/remotes/origin/pr-60
git switch --detach refs/remotes/origin/pr-60
```

The detached checkout is intentional for a local preview; it does not modify the shared branch.

## 2. Install dependencies

```powershell
node --version
npm --version
npm ci
```

The Node version must be v22 or newer.

## 3. Add local environment variables

Create `.env.local` in the repository root. Use the team's Supabase Project URL and publishable key from **Supabase Dashboard → Project Settings → API Keys**:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
DATA_GOV_IN_API_KEY=
```

The first two values are required. `DATA_GOV_IN_API_KEY` is optional and only needed if the configured government market-data source requires it.

Use only the browser-safe `sb_publishable_...` key here. **Never** put a Supabase service-role or secret key in a `NEXT_PUBLIC_*` variable, browser code, or Git. Keep `.env.local` uncommitted.

## 4. Configure local Auth redirects

In **Supabase Dashboard → Authentication → URL Configuration → Redirect URLs**, add:

- `http://localhost:3000/auth/callback`
- `http://localhost:3000/auth/update-password`

Do not replace the production Site URL just to test locally.

## 5. Start Farmess

```powershell
npm run dev
```

Open **http://localhost:3000**. If port 3000 is occupied, Next.js will print the alternate local URL in the terminal.

The web app and Next.js API routes run locally. Authentication, database reads/writes, and Row Level Security use the connected team Supabase project, so records created during this run are stored in that shared cloud database—not in a local database.

## 6. Run quality checks

```powershell
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
```

## Important data and role notes

- The current team database was empty when this integration was inspected. Empty marketplace, notification, price-history and logistics states are expected until real records are added.
- Public sign-up creates farmer accounts only. Buyer, service-provider/operator and admin roles are trusted roles; users cannot grant themselves those roles from a sign-up form.
- A logistics map can show only active listings that providers have actually submitted with a location. It does not invent local transporters or storage facilities.
- The price forecaster and logistics preference ranker are offline training pipelines. They do not return trained ML predictions until there is sufficient source-attributed market history or explicit recommendation feedback and a model passes its evaluation gates.
- The Python ML pipelines are not required to run the Next.js app. Their separate dependencies live in `ml/market_forecast/requirements.txt` and `ml/logistics_ranker/requirements.txt`.

## Troubleshooting

- **Supabase configuration error:** check the two required variables in `.env.local`; restart `npm run dev` after changing them.
- **Email confirmation or password reset returns to an error page:** verify both localhost redirect URLs in Supabase Auth and check the email template's redirect configuration.
- **No logistics providers appear:** this is a data/onboarding state, not a map rendering failure. Create and verify genuine provider listings before expecting results.
- **Port already in use:** use the alternate localhost URL printed by Next.js or stop the other process using port 3000.
