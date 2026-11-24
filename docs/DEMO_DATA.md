# Demo data for evaluation

Farmess ships a seed script so evaluators can test the farmer, buyer and transport/storage journeys without waiting for real participants. Every seeded record is labelled **DEMO DATA**, and the script never creates market prices, forecasts, logistics ratings or admin accounts.

## What it creates

| Account             | Email (default domain `farmess-demo.test`) | Seeded records                                                                                                                       |
| ------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| Farmer              | `demo-farmer@…`                            | Profile with own transport (tractor-trolley, 25 q), farm size and crops; 3 produce lots — Tomato (published to buyers), Apple, Onion |
| Buyer               | `demo-buyer@…`                             | Organisation and buyer type; one active Tomato requirement (5–20 q, Jammu)                                                           |
| Transport & storage | `demo-operator@…`                          | Organisation, services, fleet and cold chain; one transport and one cold-storage listing near Jammu                                  |

Rows are inserted while signed in as each demo user, so Row Level Security and database triggers apply exactly as for real users. Running the script again does not duplicate records.

## What it never creates

- **Mandi prices** — import real OGD India / AGMARKNET observations from `/admin/market-data` with `DATA_GOV_IN_API_KEY` configured.
- **Forecasts or ML labels** — models train only on genuine data (see `ml/market_forecast/README.md`).
- **Admin accounts** — admins are provisioned only by the project owner.

## Running it

Run from the `farmess` folder. Provide values in your shell for that command only; never commit them.

```powershell
$env:NEXT_PUBLIC_SUPABASE_URL = "<project url>"
$env:NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "<publishable key>"
$env:SUPABASE_SECRET_KEY = "<secret key from Supabase → Project Settings → API>"
$env:FARMESS_DEMO_PASSWORD = "<a password of at least 12 characters you choose>"

npm run seed:demo                      # dry run: prints the plan only
npm run seed:demo -- --confirm         # creates or updates the demo data
npm run seed:demo -- --remove --confirm  # deletes the demo accounts and their data
```

Share the demo email addresses and your chosen password with evaluators directly, not in the repository. Sign in on the matching portal tab (Farmer, Buyer or Transport & storage) on `/login`.
