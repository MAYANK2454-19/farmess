#!/usr/bin/env node
/**
 * Farmess demo seed — clearly labelled sample data so evaluators can test the
 * farmer, buyer and transport/storage journeys.
 *
 * What it creates (all marked DEMO):
 *   - three demo accounts: farmer, buyer, transport & storage operator
 *   - farmer: produce lots (one published to buyers) and profile details
 *   - operator: one transport and one cold-storage listing near Jammu
 *   - buyer: one active requirement
 *
 * What it never creates: mandi prices, forecasts or logistics ratings. Market
 * data must come from the OGD India / AGMARKNET import, never from a seed.
 * It never creates admin accounts.
 *
 * Rows are written while signed in as each demo user, so the same Row Level
 * Security and database triggers apply as for real users.
 *
 * Usage (from the farmess folder, values in your shell — never commit them):
 *   NEXT_PUBLIC_SUPABASE_URL=...  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
 *   SUPABASE_SECRET_KEY=...       FARMESS_DEMO_PASSWORD=...
 *   node scripts/seed-demo-data.mjs             # dry run: shows the plan
 *   node scripts/seed-demo-data.mjs --confirm   # creates/updates demo data
 *   node scripts/seed-demo-data.mjs --remove --confirm   # deletes demo data and accounts
 */
import { createClient } from "@supabase/supabase-js";

const DEMO_TAG = "DEMO DATA";
const DEMO_NOTE = `${DEMO_TAG} — sample record for evaluation, not a real listing.`;
const EMAIL_DOMAIN = process.env.FARMESS_DEMO_EMAIL_DOMAIN || "farmess-demo.test";

const ACCOUNTS = {
  farmer: { email: `demo-farmer@${EMAIL_DOMAIN}`, name: "Demo Farmer (sample data)" },
  buyer: { email: `demo-buyer@${EMAIL_DOMAIN}`, name: "Demo Buyer (sample data)" },
  operator: { email: `demo-operator@${EMAIL_DOMAIN}`, name: "Demo Transport (sample data)" },
};

// Jammu city area; listings are placed here so locality discovery has results.
const JAMMU = { lat: 32.7266, lng: 74.857 };

const args = new Set(process.argv.slice(2));
const CONFIRM = args.has("--confirm");
const REMOVE = args.has("--remove");

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`Missing ${name}. Set it in your shell; do not commit it.`);
    process.exit(1);
  }
  return value;
}

function isoDate(offsetDays) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
const publishableKey = requireEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
const secretKey = requireEnv("SUPABASE_SECRET_KEY");
const password = requireEnv("FARMESS_DEMO_PASSWORD");

if (password.length < 12) {
  console.error("FARMESS_DEMO_PASSWORD must be at least 12 characters.");
  process.exit(1);
}

const admin = createClient(url, secretKey, { auth: { persistSession: false } });

async function findUser(email) {
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const match = data.users.find((user) => user.email?.toLowerCase() === email);
    if (match) return match;
    if (data.users.length < 200) return null;
  }
  return null;
}

async function ensureAccount(role) {
  const { email, name } = ACCOUNTS[role];
  const existing = await findUser(email);
  if (existing) {
    if (existing.app_metadata?.farmess_role !== role) {
      throw new Error(`${email} exists with a different role; refusing to change it.`);
    }
    return existing;
  }
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { farmess_role: role },
    user_metadata: { display_name: name, demo_account: true },
  });
  if (error) throw error;
  // The signup trigger creates the profile with the trusted role; set the name.
  const profile = await admin
    .from("profiles")
    .update({ display_name: name })
    .eq("id", data.user.id);
  if (profile.error) throw profile.error;
  return data.user;
}

async function signInAs(role) {
  const client = createClient(url, publishableKey, { auth: { persistSession: false } });
  const { error } = await client.auth.signInWithPassword({
    email: ACCOUNTS[role].email,
    password,
  });
  if (error) throw new Error(`Sign-in failed for demo ${role}: ${error.message}`);
  return client;
}

async function seedFarmer(userId) {
  const farmer = await signInAs("farmer");

  const profile = await farmer
    .from("profiles")
    .update({
      market_area: "Narwal mandi area, Jammu",
      approximate_location_sharing: true,
      own_transport: true,
      transport_vehicle_type: "tractor_trolley",
      transport_capacity_quintal: 25,
      farm_size_acres: 4.5,
      primary_crops: ["Tomato", "Apple", "Onion"],
    })
    .eq("id", userId);
  if (profile.error) throw new Error(`Farmer profile: ${profile.error.message}`);

  const existing = await farmer.from("produce_lots").select("id").eq("notes", DEMO_NOTE);
  if (existing.error) throw existing.error;
  if ((existing.data ?? []).length > 0) return "farmer lots already present";

  const lots = [
    { crop: "Tomato", variety: "Hybrid", grade: "A", quantity: 12.5, sell: 3, from: 0 },
    { crop: "Apple", variety: "Delicious", grade: "A", quantity: 40, sell: 18, from: 2 },
    { crop: "Onion", variety: null, grade: "B", quantity: 8, sell: 10, from: 1 },
  ];
  const inserted = await farmer
    .from("produce_lots")
    .insert(
      lots.map((lot) => ({
        owner_id: userId,
        crop: lot.crop,
        variety: lot.variety,
        grade: lot.grade,
        quantity: lot.quantity,
        unit: "quintal",
        approximate_area: "Narwal mandi area, Jammu",
        available_from: isoDate(lot.from),
        sell_by: isoDate(lot.sell),
        notes: DEMO_NOTE,
      })),
    )
    .select("id,crop");
  if (inserted.error) throw new Error(`Farmer lots: ${inserted.error.message}`);

  // Publish the tomato lot so buyers can see and offer on it.
  const tomato = inserted.data.find((lot) => lot.crop === "Tomato");
  const published = await farmer
    .from("produce_lots")
    .update({ status: "published" })
    .eq("id", tomato.id)
    .eq("status", "draft");
  if (published.error) {
    return `3 lots created; publishing failed (${published.error.message}) — publish from My Produce`;
  }
  return "3 lots created, Tomato published to buyers";
}

async function seedOperator(userId) {
  const operator = await signInAs("operator");

  const profile = await operator
    .from("profiles")
    .update({
      organisation_name: "Demo Valley Logistics (sample data)",
      operator_service_types: ["transport", "cold_storage"],
      operator_fleet_size: 4,
      operator_cold_chain: true,
      market_area: "Jammu",
    })
    .eq("id", userId);
  if (profile.error) throw new Error(`Operator profile: ${profile.error.message}`);

  const existing = await operator.from("service_listings").select("id").like("title", "[DEMO]%");
  if (existing.error) throw existing.error;
  if ((existing.data ?? []).length > 0) return "operator listings already present";

  const point = (dLat, dLng) => `POINT(${JAMMU.lng + dLng} ${JAMMU.lat + dLat})`;
  const listings = [
    {
      title: "[DEMO] Mini-truck transport, Jammu district",
      service_type: "transport",
      service_area: "Jammu district",
      destination_area: "Narwal mandi, Jammu",
      description: `${DEMO_NOTE} Indicative rate; confirm with the provider.`,
      price_paise: 2500 * 100,
      rate_basis: "per_trip",
      capacity_quantity: 30,
      capacity_unit: "quintal",
      service_location: point(0.01, 0.02),
      service_radius_km: 40,
      cold_chain_available: false,
    },
    {
      title: "[DEMO] Cold storage, Bari Brahmana",
      service_type: "storage",
      service_area: "Bari Brahmana, Jammu",
      destination_area: null,
      description: `${DEMO_NOTE} Indicative rate; capacity must be confirmed.`,
      price_paise: 120 * 100,
      rate_basis: "per_quintal",
      capacity_quantity: 500,
      capacity_unit: "quintal",
      service_location: point(-0.09, 0.07),
      service_radius_km: 25,
      cold_chain_available: true,
    },
  ];

  const inserted = await operator.from("service_listings").insert(
    listings.map((listing) => ({
      ...listing,
      operator_id: userId,
      available_from: isoDate(0),
      available_until: isoDate(60),
      crop_suitability: ["Tomato", "Apple", "Onion"],
      status: "active",
    })),
  );
  if (inserted.error) throw new Error(`Operator listings: ${inserted.error.message}`);
  return "2 listings created (transport + cold storage)";
}

async function seedBuyer(userId) {
  const buyer = await signInAs("buyer");

  const profile = await buyer
    .from("profiles")
    .update({
      organisation_name: "Demo Jammu Fresh Traders (sample data)",
      buyer_type: "trader",
      market_area: "Jammu",
    })
    .eq("id", userId);
  if (profile.error) throw new Error(`Buyer profile: ${profile.error.message}`);

  const existing = await buyer
    .from("buyer_requirements")
    .select("id")
    .eq("buyer_id", userId)
    .eq("crop", "Tomato");
  if (existing.error) throw existing.error;
  if ((existing.data ?? []).length > 0) return "buyer requirement already present";

  const inserted = await buyer.from("buyer_requirements").insert({
    buyer_id: userId,
    crop: "Tomato",
    variety: "Hybrid",
    grade: "A",
    market_area: "Jammu",
    min_quantity: 5,
    max_quantity: 20,
    unit: "quintal",
    target_price_paise_per_quintal: null,
    delivery_by: isoDate(7),
    status: "active",
  });
  if (inserted.error) throw new Error(`Buyer requirement: ${inserted.error.message}`);
  return "1 active Tomato requirement created";
}

async function removeAll() {
  for (const role of Object.keys(ACCOUNTS)) {
    const user = await findUser(ACCOUNTS[role].email);
    if (!user) {
      console.log(`- ${role}: no demo account`);
      continue;
    }
    if (user.user_metadata?.demo_account !== true) {
      console.log(`- ${role}: ${ACCOUNTS[role].email} is not marked as a demo account; skipped`);
      continue;
    }
    // Profile rows and owned demo data cascade from the auth user.
    const { error } = await admin.auth.admin.deleteUser(user.id);
    console.log(error ? `- ${role}: ${error.message}` : `- ${role}: demo account and data removed`);
  }
}

async function main() {
  console.log(`Farmess demo seed → ${new URL(url).host}`);
  console.log(
    `Accounts: ${Object.values(ACCOUNTS)
      .map((a) => a.email)
      .join(", ")}`,
  );

  if (!CONFIRM) {
    console.log(
      REMOVE
        ? "Dry run: would delete the demo accounts above and their data. Add --confirm to proceed."
        : "Dry run: would create the demo accounts and labelled sample data. Add --confirm to proceed.",
    );
    return;
  }

  if (REMOVE) {
    await removeAll();
    return;
  }

  const users = {};
  for (const role of Object.keys(ACCOUNTS)) {
    users[role] = await ensureAccount(role);
    console.log(`- ${role} account ready: ${ACCOUNTS[role].email}`);
  }
  console.log(`- farmer: ${await seedFarmer(users.farmer.id)}`);
  console.log(`- operator: ${await seedOperator(users.operator.id)}`);
  console.log(`- buyer: ${await seedBuyer(users.buyer.id)}`);
  console.log("Done. Market prices are not seeded — import real OGD data from /admin/market-data.");
}

main().catch((error) => {
  console.error(`Seed failed: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
