// Lists every district name data.gov.in uses for a state in its mandi price
// history, so the names Farmess asks with can be kept correct
// (OGD_DISTRICT_NAMES and OGD_STATE_NAMES in src/lib/location/india.ts).
// The source matches the district exactly: a district it writes differently
// ("East Champaran/ Motihari") is found only under its own name.
//
//   node --experimental-strip-types scripts/check-district-names.mts --states
//   node --experimental-strip-types scripts/check-district-names.mts "Bihar" "Goa"
//   node --experimental-strip-types scripts/check-district-names.mts --all
//
// --states   list the state names in today's reports, and look for the states
//            that are quiet today in the price history
// --all      every state that has no saved scan yet
// --redo     scan again even when a scan is saved
// --budget N stop starting new states after N seconds (a later run carries on)
//
// How: the history is read sorted by district, one row at a time. The first row
// names a district; a second request counts that district's rows and gives its
// newest report; the next read starts that many rows further on. Two small
// requests per name, and the counts must add up to the state's total.
//
// Results are saved in scripts/data/ogd-districts/<state>.json. Reads
// DATA_GOV_IN_API_KEY from .env.local; the key is never printed. Run from the
// farmess folder.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const india = await import(pathToFileURL(`${process.cwd()}/src/lib/location/india.ts`).href);

const HISTORY = "https://api.data.gov.in/resource/35985678-0d79-46b4-9ed6-6f13308a1d24";
const CURRENT = "https://api.data.gov.in/resource/9ef84268-d588-465a-a308-a864a43d0070";
const OUT_DIR = path.join("scripts", "data", "ogd-districts");
const PAUSE_MS = 1_300;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function readKey(): string {
  if (process.env.DATA_GOV_IN_API_KEY?.trim()) return process.env.DATA_GOV_IN_API_KEY.trim();
  let env = "";
  try {
    env = fs.readFileSync(".env.local", "utf8");
  } catch {
    return "";
  }
  if (env.charCodeAt(0) === 0xfeff) env = env.slice(1);
  return (env.match(/^DATA_GOV_IN_API_KEY\s*=\s*"?([^"\r\n]*)"?/m)?.[1] ?? "").trim();
}

const key = readKey();
const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const budgetAt = args.indexOf("--budget");
const budgetValueAt = budgetAt >= 0 ? budgetAt + 1 : -1;
const budgetMs = budgetAt >= 0 ? Number(args[budgetValueAt]) * 1000 : Infinity;
const named = args.filter((arg, i) => !arg.startsWith("--") && i !== budgetValueAt);
const startedAt = Date.now();
if (!key || (!flag("--states") && !flag("--all") && named.length === 0)) {
  console.error('Usage: node --experimental-strip-types scripts/check-district-names.mts "Bihar"');
  console.error("       (or --all, or --states). DATA_GOV_IN_API_KEY must be set in .env.local.");
  process.exit(1);
}

type Page = { total?: number | string; records?: Record<string, unknown>[] };
let requests = 0;
let slowDowns = 0;
/** Grows when the source says "slow down" and eases back while it answers. */
let pauseMs = PAUSE_MS;

/** One request, waiting out "slow down" answers. Null when the source cannot be read. */
async function get(base: string, params: Record<string, string>): Promise<Page | null> {
  const url = new URL(base);
  url.searchParams.set("api-key", key);
  url.searchParams.set("format", "json");
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await sleep(pauseMs);
    requests += 1;
    try {
      const response = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(40_000),
      });
      if (response.status === 429) {
        // Others share this key; step well back so their requests get through.
        slowDowns += 1;
        pauseMs = Math.min(6_000, pauseMs * 1.5);
        await sleep(15_000 + attempt * 15_000);
        continue;
      }
      if (!response.ok) return null;
      pauseMs = Math.max(PAUSE_MS, pauseMs * 0.9);
      return (await response.json()) as Page;
    } catch {
      await sleep(5_000);
    }
  }
  return null;
}

/** "25/11/2026" or "2026-11-25" -> "2026-11-25". */
function isoDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const dmy = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
  return /^\d{4}-\d{2}-\d{2}$/.test(value.trim()) ? value.trim() : null;
}

type Found = { name: string; rows: number; newest: string | null; market: string | null };
type Scan = { total: number; names: Found[]; complete: boolean };
type Checkpoint = { offset: number; names: Found[] };

/** Where a field is read from, and how the source wants it named. */
type Source = {
  resource: string;
  /** The field as it is named in the rows. */
  field: string;
  /**
   * The name to sort and filter by. The price history matches its fields
   * exactly; today's reports match single words ("Uttar Pradesh" also finds
   * Madhya Pradesh) unless the exact ".keyword" form is used.
   */
  key: string;
  date: string;
  market: string;
  /** Count with the newest report first (only the price history can sort by date). */
  newestFirst: boolean;
};
const HISTORY_DISTRICTS: Source = {
  resource: HISTORY,
  field: "District",
  key: "District",
  date: "Arrival_Date",
  market: "Market",
  newestFirst: true,
};
const TODAY_STATES: Source = {
  resource: CURRENT,
  field: "state",
  key: "state.keyword",
  date: "arrival_date",
  market: "market",
  newestFirst: false,
};

/**
 * Every distinct value of one field among the rows matching `filters`, with the
 * number of rows, the newest report date and one market for each.
 */
async function distinctValues(
  source: Source,
  filters: Record<string, string>,
  /** Where an interrupted scan stopped, and a place to note how far this one has got. */
  progress?: { from?: { offset: number; names: Found[] }; save: (at: Checkpoint) => void },
): Promise<Scan> {
  const { resource, field } = source;
  const read = (offset: number) =>
    get(resource, {
      limit: "1",
      offset: String(offset),
      [`sort[${source.key}]`]: "asc",
      ...filters,
    });
  const names: Found[] = progress?.from?.names ?? [];
  const seen = new Set<string>(names.map((found) => found.name));
  let total = 0;
  let offset = progress?.from?.offset ?? 0;

  /** First offset after `from` whose row has another value (when counting does not work). */
  async function endOfGroup(from: number, value: string): Promise<number | null> {
    let low = from; // known to hold `value`
    let step = 1;
    let high = from + 1;
    while (high < total) {
      const page = await read(high);
      if (!page) return null;
      if (String(page.records?.[0]?.[field] ?? "") !== value) break;
      low = high;
      step *= 2;
      high = Math.min(total, low + step);
    }
    while (high - low > 1) {
      const middle = Math.floor((low + high) / 2);
      const page = await read(middle);
      if (!page) return null;
      if (String(page.records?.[0]?.[field] ?? "") === value) low = middle;
      else high = middle;
    }
    return high;
  }

  while (true) {
    const page = await read(offset);
    if (!page) return { total, names, complete: false };
    total = Number(page.total ?? 0);
    const record = page.records?.[0];
    if (!record || offset >= total) break;
    const raw = String(record[field] ?? "");
    if (seen.has(raw)) {
      // The count for this value was smaller than its run of rows: find the end.
      const end = await endOfGroup(offset, raw);
      if (end === null) return { total, names, complete: false };
      offset = end;
      continue;
    }
    seen.add(raw);
    const own = await get(resource, {
      limit: "1",
      ...(source.newestFirst ? { [`sort[${source.date}]`]: "desc" } : {}),
      ...filters,
      [`filters[${source.key}]`]: raw,
    });
    if (!own) return { total, names, complete: false };
    const latest = own.records?.[0];
    const rows = Number(own.total ?? 0);
    const market = latest?.[source.market];
    names.push({
      name: raw,
      rows,
      newest: isoDate(latest?.[source.date]),
      market: typeof market === "string" ? market.trim() : null,
    });
    if (rows > 0) {
      offset += rows;
    } else {
      const end = await endOfGroup(offset, raw);
      if (end === null) return { total, names, complete: false };
      offset = end;
    }
    progress?.save({ offset, names });
  }
  return { total, names, complete: true };
}

const slug = (state: string) => state.replace(/[^A-Za-z]+/g, "-").toLowerCase();
const fileFor = (state: string) => path.join(OUT_DIR, `${slug(state)}.json`);
const today = new Date().toISOString().slice(0, 10);

/** Reads a checkpoint left by a scan that was cut short. */
function readCheckpoint(file: string): Checkpoint | undefined {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as Checkpoint;
  } catch {
    return undefined;
  }
}

if (flag("--states")) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const partialFile = path.join(OUT_DIR, "_states.partial");
  // Today's reports hold every state that is reporting now, and are far fewer
  // rows to walk than twenty years of history.
  const scan = await distinctValues(
    TODAY_STATES,
    {},
    {
      from: readCheckpoint(partialFile),
      save: (at) => fs.writeFileSync(partialFile, JSON.stringify(at)),
    },
  );
  if (!scan.complete) {
    console.log(
      `The source could not be read to the end (${scan.names.length} state names so far); run again to carry on.`,
    );
    console.log(`${requests} requests, ${slowDowns} "slow down" answers.`);
    process.exit(1);
  }
  console.log(`\nState names in today's reports (${scan.total} rows):`);
  for (const found of scan.names) {
    const state: string | null = india.canonicalState(found.name);
    const asked = state ? india.ogdStateName(state) : null;
    const note = !state
      ? "NOT A STATE OF THE LIST"
      : asked === found.name
        ? ""
        : `Farmess asks for "${asked}"`;
    console.log(
      `  ${JSON.stringify(found.name).padEnd(44)} ${String(found.rows).padStart(6)} rows  ${note}`,
    );
  }
  // States with no reports today: are they in the price history under the name asked with?
  const reporting = new Set(scan.names.map((found) => found.name));
  const quiet = [];
  for (const state of india.INDIA_STATES as readonly string[]) {
    const asked: string = india.ogdStateName(state);
    if (reporting.has(asked)) continue;
    const page = await get(HISTORY, {
      limit: "1",
      "sort[Arrival_Date]": "desc",
      "filters[State]": asked,
    });
    quiet.push({
      state,
      asked,
      historyRows: page ? Number(page.total ?? 0) : null,
      newest: isoDate(page?.records?.[0]?.Arrival_Date),
    });
  }
  console.log("\nStates with no reports today under the name Farmess asks with:");
  for (const item of quiet) {
    console.log(
      `  ${JSON.stringify(item.asked).padEnd(44)} history ${item.historyRows ?? "?"} rows, newest ${item.newest ?? "none"}`,
    );
  }
  if (quiet.length === 0) console.log("  none");
  fs.writeFileSync(
    path.join(OUT_DIR, "_states.json"),
    JSON.stringify({ scannedOn: today, rowsToday: scan.total, today: scan.names, quiet }, null, 2) +
      "\n",
  );
  fs.rmSync(partialFile, { force: true });
  console.log(`\n${requests} requests, ${slowDowns} "slow down" answers.`);
  process.exit(0);
}

const states: string[] = flag("--all")
  ? [...india.INDIA_STATES]
  : named.map((name) => india.canonicalState(name) ?? name);
fs.mkdirSync(OUT_DIR, { recursive: true });

for (const state of states) {
  const listed: readonly string[] = india.districtsForState(state);
  if (listed.length === 0) {
    console.log(`"${state}" is not a state in src/lib/location/india.ts; skipped.`);
    continue;
  }
  if (fs.existsSync(fileFor(state)) && !flag("--redo")) {
    if (!flag("--all")) console.log(`${state}: already scanned (use --redo to scan again).`);
    continue;
  }
  if (Date.now() - startedAt > budgetMs) {
    console.log(`Time budget used up before ${state}; run again to carry on.`);
    break;
  }
  const sourceState: string = india.ogdStateName(state);
  // A scan that was cut short is carried on from where it stopped.
  const partialFile = path.join(OUT_DIR, `${slug(state)}.partial`);
  const scan = await distinctValues(
    HISTORY_DISTRICTS,
    { "filters[State]": sourceState },
    {
      from: readCheckpoint(partialFile),
      save: (at) => fs.writeFileSync(partialFile, JSON.stringify(at)),
    },
  );
  const counted = scan.names.reduce((sum, found) => sum + found.rows, 0);
  if (!scan.complete) {
    console.log(`${state}: the source could not be read to the end; run again to carry on.`);
    continue;
  }
  fs.rmSync(partialFile, { force: true });
  fs.writeFileSync(
    fileFor(state),
    JSON.stringify(
      {
        state,
        sourceState,
        scannedOn: today,
        rows: scan.total,
        rowsCounted: counted,
        names: scan.names,
      },
      null,
      2,
    ) + "\n",
  );
  const unmatched = scan.names.filter(
    (found) => india.districtForSourceName(state, found.name) === null,
  ).length;
  console.log(
    `${state}: ${scan.names.length} district names, ${scan.total} rows` +
      (counted === scan.total ? "" : ` (COUNTS ADD UP TO ${counted})`) +
      (scan.total === 0 ? ` — NO ROWS UNDER "${sourceState}"` : "") +
      `, ${unmatched} not matched to a listed district`,
  );
}
console.log(`${requests} requests, ${slowDowns} "slow down" answers.`);
