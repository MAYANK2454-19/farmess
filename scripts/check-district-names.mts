// Compares the districts Farmess lists for a state with the district names
// data.gov.in uses in its mandi price data, to keep OGD_DISTRICT_NAMES in
// src/lib/location/india.ts correct. The source's district filter is an exact
// match, so a district it writes differently is found only under its own name.
//
//   node --experimental-strip-types scripts/check-district-names.mts "Bihar"
//
// Prints which listed districts have no rows under their usual name, and which
// source names were seen (today's reports and a sample of recent history) with
// the district each one is matched to. Reads DATA_GOV_IN_API_KEY from
// .env.local; the key is never printed. Run from the farmess folder.
import fs from "node:fs";
import { pathToFileURL } from "node:url";

const india = await import(pathToFileURL(`${process.cwd()}/src/lib/location/india.ts`).href);
const env = fs.readFileSync(".env.local", "utf8").replace(/^﻿/, "");
const key =
  process.env.DATA_GOV_IN_API_KEY?.trim() ||
  (env.match(/^DATA_GOV_IN_API_KEY\s*=\s*"?([^"\r\n]*)"?/m)?.[1] ?? "").trim();
const state = process.argv[2];
if (!state || !key) {
  console.error('Usage: node --experimental-strip-types scripts/check-district-names.mts "Bihar"');
  console.error("DATA_GOV_IN_API_KEY must be set in .env.local.");
  process.exit(1);
}
const canonical: string = india.canonicalState(state) ?? state;
const sourceState: string = india.ogdStateName(canonical);
const listed: readonly string[] = india.districtsForState(canonical);
if (listed.length === 0) {
  console.error(`"${state}" is not a state in src/lib/location/india.ts.`);
  process.exit(1);
}

const HISTORY = "https://api.data.gov.in/resource/35985678-0d79-46b4-9ed6-6f13308a1d24";
const CURRENT = "https://api.data.gov.in/resource/9ef84268-d588-465a-a308-a864a43d0070";
const HISTORY_SAMPLE_PAGES = 30;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Page = { total?: number; records?: Record<string, unknown>[] };

/** One request, waiting out "slow down" answers. Null when the source cannot be read. */
async function get(base: string, params: Record<string, string>): Promise<Page | null> {
  const url = new URL(base);
  url.searchParams.set("api-key", key);
  url.searchParams.set("format", "json");
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(30_000),
      });
      if (response.status === 429) {
        await sleep(8_000 + attempt * 6_000);
        continue;
      }
      return response.ok ? ((await response.json()) as Page) : null;
    } catch {
      await sleep(4_000);
    }
  }
  return null;
}

console.log(`${canonical}: checking ${listed.length} districts against data.gov.in ...`);

// 1. Rows under exactly the usual name.
const missing: string[] = [];
const unread: string[] = [];
for (const district of listed) {
  const page = await get(HISTORY, {
    limit: "1",
    "filters[State]": sourceState,
    "filters[District]": district,
  });
  if (!page) unread.push(district);
  else if (!Number(page.total)) missing.push(district);
  await sleep(1_200);
}

// 2. The names the source itself uses: today's reports, then recent history.
const seen = new Map<string, number>();
const note = (value: unknown) => {
  const name = typeof value === "string" ? value.trim() : "";
  if (name) seen.set(name, (seen.get(name) ?? 0) + 1);
};
for (let offset = 0, page = 0; page < 45; page += 1) {
  const body = await get(CURRENT, {
    limit: "1000",
    offset: String(offset),
    "filters[state]": sourceState,
  });
  const records = body?.records ?? [];
  for (const record of records) note(record.district);
  offset += records.length;
  if (records.length === 0 || Number(body?.total) <= offset) break;
  await sleep(1_200);
}
for (let offset = 0, page = 0; page < HISTORY_SAMPLE_PAGES; page += 1) {
  const body = await get(HISTORY, {
    limit: "1000",
    offset: String(offset),
    "sort[Arrival_Date]": "desc",
    "filters[State]": sourceState,
  });
  const records = body?.records ?? [];
  for (const record of records) note(record.District);
  offset += records.length;
  if (records.length === 0) break;
  await sleep(1_200);
}

console.log(`\nListed under the usual name: ${listed.length - missing.length - unread.length}`);
if (unread.length > 0) console.log(`Could not be read (try again): ${unread.join(", ")}`);
console.log(`No rows under the usual name: ${missing.join(", ") || "none"}`);

console.log("\nSource names that differ from the list, and the district each is matched to:");
const usual = new Set(listed.map((name) => name.toLowerCase()));
let differing = 0;
for (const name of [...seen.keys()].sort()) {
  if (usual.has(name.toLowerCase())) continue;
  differing += 1;
  const district: string | null = india.districtForSourceName(canonical, name);
  console.log(
    `  ${JSON.stringify(name)} -> ${district ?? "not matched (if it is a district of this state, add it to OGD_DISTRICT_NAMES)"}`,
  );
}
if (differing === 0) console.log("  none in this sample");

const covered = new Set(
  [...seen.keys()].map((name) => india.districtForSourceName(canonical, name)).filter(Boolean),
);
const open = missing.filter((district) => !covered.has(district));
console.log(
  open.length > 0
    ? `\nStill without a source name (not in today's reports or the history sample): ${open.join(", ")}`
    : "\nEvery district without rows under its usual name is matched to a source name.",
);
