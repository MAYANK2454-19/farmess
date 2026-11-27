// Builds src/lib/location/ogd-district-names.ts: for every district that
// data.gov.in lists under another name than Farmess uses (or under more than
// one name), the exact names to ask the source with.
//
//   node --experimental-strip-types scripts/build-district-names.mts           build
//   node --experimental-strip-types scripts/build-district-names.mts --report  only print what was found
//
// Input: the scans saved by check-district-names.mts in
// scripts/data/ogd-districts, and scripts/data/ogd-district-manual.json for the
// names no spelling rule can connect to a district. In that file a source name
// maps to:
//   - a district of the list ("Chhapra": "Saran");
//   - "*" when the source uses one name for every district of the state
//     (its single "Delhi" for the eleven districts of Delhi);
//   - null when it is not a district of that state at all.
//
// Only names with a report in the last 400 days are used: the automatic fetch
// reads one year, so a spelling the source stopped using is of no use to it.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const india = await import(pathToFileURL(`${process.cwd()}/src/lib/location/india.ts`).href);

const SCAN_DIR = path.join("scripts", "data", "ogd-districts");
const MANUAL = path.join("scripts", "data", "ogd-district-manual.json");
const OUT = path.join("src", "lib", "location", "ogd-district-names.ts");
const CURRENT_DAYS = 400;
const EVERY_DISTRICT = "*";
const reportOnly = process.argv.includes("--report");

type Found = { name: string; rows: number; newest: string | null; market: string | null };
type StateScan = {
  state: string;
  sourceState: string;
  scannedOn: string;
  rows: number;
  rowsCounted: number;
  names: Found[];
};

const manual: Record<string, Record<string, string | null>> = fs.existsSync(MANUAL)
  ? JSON.parse(fs.readFileSync(MANUAL, "utf8"))
  : {};

/** The listed district a source name fits best by spelling alone; null when none or a tie. */
function bySpelling(
  state: string,
  sourceName: string,
): { district: string; strength: number } | null {
  let best: { district: string; strength: number } | null = null;
  let tied = false;
  for (const district of india.districtsForState(state) as readonly string[]) {
    const strength: number = india.placeMatchStrength(sourceName, district);
    if (strength === 0 || (best && strength < best.strength)) continue;
    tied = best !== null && strength === best.strength;
    best = { district, strength };
  }
  return best && !tied ? best : null;
}

const daysBefore = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00.000Z`) - days * 86_400_000).toISOString().slice(0, 10);
const newestFirst = (a: Found, b: Found) =>
  (b.newest ?? "").localeCompare(a.newest ?? "") || b.rows - a.rows;

const table: Record<string, Record<string, string[]>> = {};
/** Source names that stand for every district of a state. */
const statewide: Record<string, string[]> = {};
/** States whose scan reached the end with counts that add up. */
const checked: string[] = [];
const scannedOn = new Set<string>();
const problems: string[] = [];
let statesRead = 0;
let namesListed = 0;

const files = fs.existsSync(SCAN_DIR)
  ? fs.readdirSync(SCAN_DIR).filter((file) => file.endsWith(".json") && !file.startsWith("_"))
  : [];
for (const file of files.sort()) {
  const scan = JSON.parse(fs.readFileSync(path.join(SCAN_DIR, file), "utf8")) as StateScan;
  const listed = india.districtsForState(scan.state) as readonly string[];
  if (listed.length === 0) {
    problems.push(`${file}: "${scan.state}" is not a state of the list.`);
    continue;
  }
  statesRead += 1;
  scannedOn.add(scan.scannedOn);
  if (scan.rowsCounted !== scan.rows) {
    problems.push(
      `${scan.state}: counts add up to ${scan.rowsCounted}, the state has ${scan.rows}.`,
    );
  } else {
    // A state with no rows at all is settled too: there is nothing to look for.
    checked.push(scan.state);
  }
  const since = daysBefore(scan.scannedOn, CURRENT_DAYS);
  const byHand = manual[scan.state] ?? {};
  const assigned = new Map<string, Found[]>();
  const forAll: Found[] = [];
  const report: string[] = [];
  const unmatchedOld: string[] = [];

  for (const found of scan.names) {
    const name = found.name.trim();
    const current = found.newest !== null && found.newest >= since;
    let district: string | null;
    if (name in byHand) {
      district = byHand[name];
      if (district === null) continue;
      if (district === EVERY_DISTRICT) {
        if (current) forAll.push(found);
        continue;
      }
      if (!listed.includes(district)) {
        problems.push(
          `${scan.state}: "${name}" is mapped by hand to "${district}", not a listed district.`,
        );
        continue;
      }
    } else {
      const match = bySpelling(scan.state, name);
      if (!match) {
        const line = `${JSON.stringify(name)} (${found.rows} rows, newest ${found.newest ?? "?"}, e.g. ${found.market ?? "?"})`;
        if (current) report.push(`  NOT MATCHED  ${line}`);
        else unmatchedOld.push(name);
        continue;
      }
      district = match.district;
      // A match that is not the same name is shown, so that a wrong one is noticed.
      if (current && match.strength < 4) {
        report.push(
          `  check        ${JSON.stringify(name)} -> ${district} (spelling ${match.strength}; ${found.rows} rows, newest ${found.newest}, e.g. ${found.market ?? "?"})`,
        );
      }
    }
    if (!current) continue;
    // Kept exactly as the source writes it: the filter is exact down to a
    // trailing space ("North and Middle Andaman " finds rows, without it none).
    assigned.set(district, [...(assigned.get(district) ?? []), found]);
  }

  const entries: Record<string, string[]> = {};
  for (const district of listed) {
    const names = (assigned.get(district) ?? []).sort(newestFirst).map((found) => found.name);
    // Nothing to note when the source uses exactly the usual name and no other.
    if (names.length === 0 || (names.length === 1 && names[0] === district)) continue;
    entries[district] = names;
    namesListed += names.length;
  }
  if (Object.keys(entries).length > 0) table[scan.state] = entries;
  if (forAll.length > 0) {
    statewide[scan.state] = forAll.sort(newestFirst).map((found) => found.name);
  }

  const reporting =
    forAll.length > 0 ? listed.length : listed.filter((d) => assigned.has(d)).length;
  const silent = forAll.length > 0 ? [] : listed.filter((district) => !assigned.has(district));
  console.log(
    scan.rows === 0
      ? `\n${scan.state}: the source has no rows under "${scan.sourceState}"`
      : `\n${scan.state}: ${scan.names.length} source names; ${reporting} of ${listed.length} districts have reports in the last ${CURRENT_DAYS} days; ${Object.keys(entries).length} listed differently` +
          (forAll.length > 0
            ? `; one name for every district: ${forAll.map((f) => f.name).join(", ")}`
            : ""),
  );
  for (const line of report) console.log(line);
  if (silent.length > 0 && scan.rows > 0) console.log(`  no recent reports: ${silent.join(", ")}`);
  if (unmatchedOld.length > 0) console.log(`  old names, not matched: ${unmatchedOld.join(" | ")}`);
}

if (problems.length > 0) {
  console.log("\nProblems:");
  for (const problem of problems) console.log(`  ${problem}`);
}
console.log(
  `\n${statesRead} states read; ${Object.values(table).reduce((sum, entries) => sum + Object.keys(entries).length, 0)} districts listed under other names (${namesListed} names).`,
);
if (reportOnly) process.exit(problems.length > 0 ? 1 : 0);

const dates = [...scannedOn].sort();
const when =
  dates.length === 0 ? "never" : dates.length === 1 ? dates[0] : `${dates[0]} to ${dates.at(-1)}`;
const source = `/*
 * District names exactly as the OGD mandi datasets (data.gov.in) write them,
 * for districts the source lists under another name than Farmess uses, or
 * under more than one name. The source matches a district's name exactly, so
 * these are the names to ask with; the first is the one with the newest
 * reports.
 *
 * GENERATED by scripts/build-district-names.mts from the scans in
 * scripts/data/ogd-districts (every district name in the source's price
 * history, read ${when}) and the hand-checked names in
 * scripts/data/ogd-district-manual.json. Do not edit by hand: scan again
 * with scripts/check-district-names.mts and rebuild.
 *
 * A district that is not here is asked for under its usual name.
 */
export const OGD_DISTRICT_NAMES: Record<string, Record<string, readonly string[]>> = ${JSON.stringify(table, null, 2)};

/**
 * Names the source uses for every district of a state at once: it lists all
 * of Delhi's mandis under the single district "Delhi".
 */
export const OGD_STATEWIDE_DISTRICT_NAMES: Record<string, readonly string[]> = ${JSON.stringify(statewide, null, 2)};

/**
 * States whose district names were all read from the source. A district of
 * such a state that is not listed above is written the usual way there, or
 * has no mandi reports in the last ${CURRENT_DAYS} days, so looking for
 * another spelling is pointless.
 */
export const OGD_DISTRICT_NAMES_CHECKED: readonly string[] = ${JSON.stringify(checked.sort(), null, 2)};
`;

// Written in the project's code style, so the format check passes untouched.
let formatted = source;
try {
  const prettier = await import("prettier");
  const options = (await prettier.resolveConfig(OUT)) ?? {};
  formatted = await prettier.format(source, { ...options, filepath: OUT });
} catch {
  console.log("Prettier is not installed; run it on the generated file before committing.");
}
fs.writeFileSync(OUT, formatted);
console.log(`Wrote ${OUT}`);
