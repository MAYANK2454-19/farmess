import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { after } from "next/server";
import {
  canonicalDistrict,
  canonicalState,
  ogdDistrictNames,
  ogdStateName,
  sourceDistrictNames,
} from "@/lib/location/india";
import { logEvent } from "@/lib/observability/logger";
import { marketIngestToken } from "@/lib/security/server-secret";
import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import { createUserTokenClient, secondsUntilExpiry } from "@/lib/supabase/token-client";
import { ensureDistrictWeather, weatherIsEnabled } from "@/lib/weather/district-weather";
import {
  assessImportNeed,
  historyDaysFor,
  importSeriesKey,
  isoDaysBefore,
  retrySecondsFor,
  runAutoImport,
  toIngestRow,
  type AutoImportResult,
  type ImportNeed,
  type ImportNeedReason,
  type ImportOutcome,
  type ImportScope,
  type IngestRow,
} from "./auto-import";
import { canonicalCommodity } from "./commodities";
import { priceRecordsToRows, type SavedCoverage } from "./history-import";
import { reconcileMarketObservationHistory } from "./import-batch";
import { OGD_RESOURCE_URL } from "./normalize";
import { cacheKeyForFilters, TtlCache } from "./ogd-cache";
import { OGD_HISTORY_RESOURCE_URL } from "./ogd-history";
import { searchOgdPrices } from "./ogd-provider";
import type { MarketPriceRecord } from "./types";

/*
 * Server side of the automatic price import (rules and loop: auto-import.ts).
 *
 * Any signed-in farmer, buyer or operator can cause an import simply by looking
 * up a crop for their area, but none of them can write prices directly: rows go
 * through database functions that require a token only this server can derive
 * (FARMESS_SERVER_SECRET) and that validate every row. A per-crop, per-area
 * claim in the database stops two people starting the same import at once and
 * spaces out repeat attempts, which keeps Farmess inside data.gov.in limits.
 */

type Db = SupabaseClient<Database>;

/** Fetching stops this long after a run starts, leaving time to save within the 300 s limit. */
const TIME_BUDGET_MS = 200_000;
/** A background run needs the user's sign-in token to stay valid until it ends. */
const MINIMUM_TOKEN_SECONDS = 330;
/** District weather is fetched after the prices, inside the same 300 s limit. */
const WEATHER_BUDGET_MS = 270_000;
const WEATHER_ONLY_BUDGET_MS = 120_000;
const WEATHER_ONLY_TOKEN_SECONDS = 150;
/** Crop and state pairs whose weather was checked recently by this server instance. */
const recentWeatherChecks = new TtlCache<true>(300);
const CURRENT_LIMIT = 500;
const INGEST_CHUNK = 1_000;
/** How far back saved reports are searched for the source's spelling of a district. */
const SPELLING_LOOKBACK_DAYS = 400;

export type ImportTrigger = "search" | "lot" | "requirement";

/** What the latest fetch for one crop and area did, as far as this server knows. */
export type RunInfo = {
  state: "running" | ImportOutcome;
  /** Rows saved by that fetch so far. */
  saved: number;
  /** Seconds until Farmess may try this crop and area again (0 while running). */
  retryInSeconds: number;
  /** True while data.gov.in has asked Farmess to slow down. */
  slowedDown: boolean;
};

export type MarketHistoryStatus = {
  /** False when the server has no data.gov.in key or no server secret. */
  configured: boolean;
  crop: string;
  state: string | null;
  district: string | null;
  /** Area the counts describe: the district, or the state when the district has no reports. */
  scope: "district" | "state" | null;
  savedReports: number;
  newestDate: string | null;
  oldestDate: string | null;
  needed: boolean;
  reason: ImportNeedReason | "no_location" | "not_configured" | "unavailable";
  /** True when this request started a background fetch. */
  started: boolean;
  /** True when this request started fetching district weather for the forecast. */
  weatherStarted: boolean;
  /** The district as data.gov.in spells it, when that differs ("East Champaran/ Motihari"). */
  sourceDistrict: string | null;
  /** The latest fetch for the district and for the whole state, when known. */
  runs: { district: RunInfo | null; state: RunInfo | null };
};

type Coverage = { history: SavedCoverage; allCount: number; latestAny: string | null };

/*
 * What each fetch did is remembered in this server's memory, so the page can
 * say "data.gov.in asked us to slow down" or "nothing is listed for this
 * district" instead of an endless "fetching". It is a courtesy, not a record:
 * another server instance simply reports nothing and the page falls back to a
 * general message. The claims in the database remain the source of truth.
 */
type RunNote = { state: RunInfo["state"]; saved: number; slowedDown: boolean; retryAt: number };
const runNotes = new TtlCache<RunNote>(400);
const RUNNING_NOTE_MS = 6 * 60_000;

function noteRunning(
  scope: ImportScope,
  patch: Partial<Pick<RunNote, "saved" | "slowedDown">> = {},
) {
  const key = importSeriesKey(scope);
  const current = runNotes.get(key);
  const base: RunNote =
    current?.state === "running"
      ? current
      : { state: "running", saved: 0, slowedDown: false, retryAt: 0 };
  runNotes.set(key, { ...base, ...patch }, RUNNING_NOTE_MS);
}

function noteFinished(scope: ImportScope, outcome: ImportOutcome, saved: number) {
  const retryMs = retrySecondsFor(outcome) * 1000;
  runNotes.set(
    importSeriesKey(scope),
    { state: outcome, saved, slowedDown: false, retryAt: Date.now() + retryMs },
    Math.min(60 * 60_000, Math.max(2 * 60_000, retryMs + 60_000)),
  );
}

function runInfo(scope: ImportScope): RunInfo | null {
  const note = runNotes.get(importSeriesKey(scope));
  if (!note) return null;
  return {
    state: note.state,
    saved: note.saved,
    slowedDown: note.slowedDown,
    retryInSeconds:
      note.state === "running" ? 0 : Math.max(0, Math.ceil((note.retryAt - Date.now()) / 1000)),
  };
}

/** One answer for a district the source lists under several names. */
function districtRunInfo(scopes: readonly ImportScope[]): RunInfo | null {
  const infos = scopes.map(runInfo).filter((info): info is RunInfo => info !== null);
  return (
    infos.find((info) => info.state === "running") ??
    // "Nothing under this name" says little while another name has an answer.
    infos.find((info) => info.state !== "no_data") ??
    infos[0] ??
    null
  );
}

/** True while this server knows a new attempt would be refused (running, or cooling down). */
function knownBusy(scope: ImportScope): boolean {
  const note = runNotes.get(importSeriesKey(scope));
  return Boolean(note && (note.state === "running" || note.retryAt > Date.now()));
}

/** The source's names for a district, by state and requested district. */
const districtNameCache = new TtlCache<string[]>(300);
/** A district is asked for under at most this many names. */
const MAX_DISTRICT_NAMES = 3;

/**
 * The names to ask data.gov.in with for one district, the main one first.
 *
 * The source writes some districts its own way ("East Champaran/ Motihari"
 * for East Champaran, "Chhapra" as well as "Saran" for Saran) and its district
 * filter is exact, so asking with the usual name can find nothing. The names
 * come from reports already saved for the state (they carry the source's
 * spelling) and from the checked list in india.ts; a district that appears in
 * neither is asked for under its usual name.
 */
async function districtSourceNames(
  db: Db,
  canonState: string,
  sourceState: string,
  district: string,
  today: string,
): Promise<string[]> {
  const key = `${sourceState}|${district}`.toLowerCase();
  const cached = districtNameCache.get(key);
  if (cached) return cached;
  const listed = ogdDistrictNames(canonState, district);
  const usual = listed.length > 0 ? [...listed] : [district];

  const since = isoDaysBefore(today, SPELLING_LOOKBACK_DAYS);
  const savedDistricts = (limit: number, word?: string) => {
    let query = db
      .from("market_observations")
      .select("district")
      .ilike("state", exact(sourceState))
      .gte("observation_date", since);
    if (word) query = query.ilike("district", `%${word}%`);
    return query.order("observation_date", { ascending: false }).limit(limit);
  };
  // The longest word of the name finds "East Champaran/ Motihari" even when the
  // state has far more recent rows than the second, general query returns.
  const word =
    exact(district)
      .split(/[^A-Za-z]+/)
      .sort((a, b) => b.length - a.length)[0] ?? "";
  const [similar, recent] = await Promise.all([
    word.length >= 4 ? savedDistricts(200, word) : Promise.resolve({ data: [], error: null }),
    savedDistricts(1000),
  ]);
  if (similar.error || recent.error) return usual.slice(0, MAX_DISTRICT_NAMES);

  // Newest first, so the first name that fits is the one the source uses now.
  const seen = [...(similar.data ?? []), ...(recent.data ?? [])]
    .map((row) => row.district)
    .filter((name): name is string => Boolean(name));
  const fitting = new Set(sourceDistrictNames(canonState, district, seen));
  const saved = seen.filter((name) => fitting.has(name));
  const names = [...new Set([...saved, ...usual])].slice(0, MAX_DISTRICT_NAMES);
  // Names read from saved reports or from the checked list will not change;
  // "nothing known yet" may change as soon as the first rows for the state arrive.
  const known = saved.length > 0 || listed.length > 0;
  districtNameCache.set(key, names, known ? 30 * 60_000 : 20_000);
  return names;
}

/** ilike is used as a case-insensitive equals, so pattern characters are removed. */
const exact = (value: string) => value.replace(/[%_*\\]/g, " ").trim();

/**
 * What is saved for a crop and area. For a district the source lists under
 * more than one name, pass all of them to count the district as a whole.
 */
async function loadCoverage(
  db: Db,
  scope: ImportScope,
  today: string,
  districtNames?: readonly string[],
): Promise<Coverage | null> {
  const fromDate = isoDaysBefore(today, historyDaysFor(scope));
  const base = (withCount: boolean) => {
    let query = db
      .from("market_observations")
      .select("observation_date", withCount ? { count: "exact" } : undefined)
      .ilike("crop", exact(scope.crop))
      .ilike("state", exact(scope.state))
      .gte("observation_date", fromDate);
    if (districtNames && districtNames.length > 1) query = query.in("district", [...districtNames]);
    else if (scope.district) query = query.ilike("district", exact(scope.district));
    return query;
  };
  const [newest, oldest, any] = await Promise.all([
    base(true)
      .eq("source_url", OGD_HISTORY_RESOURCE_URL)
      .order("observation_date", { ascending: false })
      .limit(1),
    base(false)
      .eq("source_url", OGD_HISTORY_RESOURCE_URL)
      .order("observation_date", { ascending: true })
      .limit(1),
    base(true).order("observation_date", { ascending: false }).limit(1),
  ]);
  if (newest.error || oldest.error || any.error) return null;
  const date = (rows: { observation_date: string }[] | null) => rows?.[0]?.observation_date ?? null;
  return {
    history: {
      savedCount: newest.count ?? 0,
      newestDate: date(newest.data),
      oldestDate: date(oldest.data),
    },
    allCount: any.count ?? 0,
    latestAny: date(any.data),
  };
}

// ---------------- today's prices (current-day resource) ----------------

/** Searches whose current-day rows were saved recently by this server instance. */
const recentCurrentSaves = new TtlCache<true>(300);
/** Set while the database function does not yet accept p_source (older schema). */
let currentSourceUnsupportedUntil = 0;

/** Save today's reported prices under the current-day resource link. Returns rows saved. */
async function saveCurrentPriceRecords(
  db: Db,
  token: string,
  records: readonly MarketPriceRecord[],
  filters: Record<string, string | number | null>,
): Promise<number> {
  if (Date.now() < currentSourceUnsupportedUntil) return 0;
  const rows = reconcileMarketObservationHistory(
    priceRecordsToRows(records, new Date().toISOString(), OGD_RESOURCE_URL),
  ).rows.map(toIngestRow);
  let saved = 0;
  for (let i = 0; i < rows.length; i += INGEST_CHUNK) {
    const chunk = rows.slice(i, i + INGEST_CHUNK);
    const { data, error } = await db.rpc("ingest_market_observations", {
      p_token: token,
      p_rows: chunk,
      p_filters: filters,
      p_received: chunk.length,
      p_note: null,
      p_source: "current",
    });
    if (error) {
      // PGRST202: the database function predates p_source. Skip quietly for a
      // while rather than store today's rows under the wrong source link.
      if (error.code === "PGRST202") currentSourceUnsupportedUntil = Date.now() + 10 * 60_000;
      else logEvent("warn", "market_current_save_failed", { reason: error.code ?? "unknown" });
      return saved;
    }
    saved += data ?? 0;
  }
  return saved;
}

/**
 * Called by the live price search: once the response has been sent, keep the
 * reports it just showed (today's prices), so trends and forecasts include them.
 */
export async function scheduleCurrentPriceSave(
  records: readonly MarketPriceRecord[],
  filters: { commodity?: string; state?: string; district?: string; market?: string },
): Promise<void> {
  const token = marketIngestToken();
  if (!token || !filters.commodity || records.length === 0) return;
  const key = cacheKeyForFilters(filters);
  if (recentCurrentSaves.get(key)) return;

  const supabase = await createClient();
  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;
  if (!accessToken || secondsUntilExpiry(accessToken) < 30) return;

  recentCurrentSaves.set(key, true, 10 * 60_000);
  after(async () => {
    try {
      const saved = await saveCurrentPriceRecords(
        createUserTokenClient(accessToken),
        token,
        records,
        {
          kind: "current-auto",
          trigger: "search",
          commodity: filters.commodity ?? null,
          state: filters.state ?? null,
          district: filters.district ?? null,
          market: filters.market ?? null,
        },
      );
      if (saved > 0) logEvent("info", "market_current_saved", { rows: saved });
    } catch {
      // Best effort: the search result was already shown to the user.
    }
  });
}

/** Fetch and save today's reports for one crop and area (used before a history run). */
async function fetchAndSaveCurrent(
  db: Db,
  token: string,
  scope: ImportScope,
  trigger: ImportTrigger,
): Promise<number> {
  const result = await searchOgdPrices({
    commodity: scope.crop,
    state: scope.state,
    ...(scope.district ? { district: scope.district } : {}),
    limit: scope.district ? 100 : CURRENT_LIMIT,
    offset: 0,
  });
  if (result.records.length === 0) return 0;
  return saveCurrentPriceRecords(db, token, result.records, {
    kind: "current-auto",
    trigger,
    commodity: scope.crop,
    state: scope.state,
    district: scope.district,
  });
}

// ---------------- history ----------------

async function ingestHistory(
  db: Db,
  token: string,
  scope: ImportScope,
  trigger: ImportTrigger,
  rows: IngestRow[],
  received: number,
  note: string | null,
): Promise<number> {
  const { data, error } = await db.rpc("ingest_market_observations", {
    p_token: token,
    p_rows: rows,
    p_filters: {
      kind: "history-auto",
      trigger,
      commodity: scope.crop,
      state: scope.state,
      district: scope.district,
      days: historyDaysFor(scope),
    },
    p_received: received,
    p_note: note,
  });
  if (error) throw new Error(error.message);
  return data ?? 0;
}

/** Run one claimed import to the end and release the claim with a retry time. */
async function runClaimed(
  db: Db,
  token: string,
  apiKey: string,
  scope: ImportScope,
  coverage: SavedCoverage,
  trigger: ImportTrigger,
  deadline: number,
): Promise<AutoImportResult | null> {
  let outcome: ImportOutcome = "source_error";
  let result: AutoImportResult | null = null;
  noteRunning(scope);
  try {
    // Today's reports are one small request; it runs alongside the history so
    // neither keeps the other (and the person looking at the page) waiting.
    const todays = fetchAndSaveCurrent(db, token, scope, trigger).catch(() => 0);
    result = await runAutoImport({
      apiKey,
      scope,
      coverage,
      today: new Date().toISOString().slice(0, 10),
      deadline,
      ingest: (rows, received, note) =>
        ingestHistory(db, token, scope, trigger, rows, received, note),
      onRateLimit: () => noteRunning(scope, { slowedDown: true }),
      onProgress: ({ saved }) => noteRunning(scope, { saved, slowedDown: false }),
    });
    outcome = result.outcome;
    await todays;
  } catch (error) {
    logEvent("error", "market_auto_import_failed", {
      crop: scope.crop,
      area: scope.district ?? scope.state,
      message: error instanceof Error ? error.message : "unknown error",
    });
  } finally {
    await db.rpc("finish_market_import", {
      p_token: token,
      p_series_key: importSeriesKey(scope),
      p_outcome: outcome,
      p_retry_seconds: retrySecondsFor(outcome),
    });
    noteFinished(scope, outcome, result?.saved ?? 0);
  }
  logEvent("info", "market_auto_import", {
    crop: scope.crop,
    state: scope.state,
    district: scope.district ?? "*",
    trigger,
    outcome,
    saved: result?.saved ?? 0,
    received: result?.received ?? 0,
    stop: result?.stopReason ?? "error",
  });
  return result;
}

async function claim(db: Db, token: string, scope: ImportScope): Promise<boolean> {
  const { data, error } = await db.rpc("claim_market_import", {
    p_token: token,
    p_series_key: importSeriesKey(scope),
  });
  return !error && data === true;
}

/** Give back a claim that was only held so that nothing else would start. */
async function releaseHeldClaim(
  db: Db,
  token: string,
  scope: ImportScope,
  retrySeconds: number,
): Promise<void> {
  await db.rpc("finish_market_import", {
    p_token: token,
    p_series_key: importSeriesKey(scope),
    p_outcome: "released",
    p_retry_seconds: retrySeconds,
  });
}

/**
 * How long the held state claim stays taken once the district's fetch is over.
 * A district that got its prices does not need the state at all. One that
 * failed is tried again first, so the state waits a little longer than it.
 */
function heldRetrySeconds(district: AutoImportResult | null): number {
  if (!district) return retrySecondsFor("source_error") + 15;
  if (district.saved > 0 || district.outcome === "complete" || district.outcome === "no_data") {
    return 60;
  }
  return retrySecondsFor(district.outcome) + 15;
}

/**
 * Work out what is saved and what is missing for a crop and area, claim an
 * import when one is due, and return the status plus the background job to run
 * after the response (null when nothing was claimed).
 */
export async function prepareMarketHistory(
  supabase: Db,
  accessToken: string | null,
  input: { crop: string; state: string | null; district: string | null },
  trigger: ImportTrigger,
): Promise<{ status: MarketHistoryStatus; run: (() => Promise<void>) | null }> {
  const crop = canonicalCommodity(input.crop).name;
  const canonState = input.state?.trim()
    ? (canonicalState(input.state) ?? input.state.trim())
    : null;
  const district =
    canonState && input.district?.trim() ? canonicalDistrict(canonState, input.district) : null;
  const apiKey = process.env.DATA_GOV_IN_API_KEY?.trim() || null;
  const token = marketIngestToken();
  const configured = Boolean(apiKey && token);

  const status: MarketHistoryStatus = {
    configured,
    crop,
    state: canonState,
    district,
    scope: null,
    savedReports: 0,
    newestDate: null,
    oldestDate: null,
    needed: false,
    reason: "no_location",
    started: false,
    weatherStarted: false,
    sourceDistrict: null,
    runs: { district: null, state: null },
  };
  if (!crop || !canonState) return { status, run: null };

  const sourceState = ogdStateName(canonState);
  const today = new Date().toISOString().slice(0, 10);
  // The district under the names the source uses for it, the main one first.
  const districtNames = district
    ? await districtSourceNames(supabase, canonState, sourceState, district, today)
    : [];
  status.sourceDistrict =
    districtNames[0] && districtNames[0] !== district ? districtNames[0] : null;
  const stateScope: ImportScope = { crop, state: sourceState, district: null };
  const districtScopes: ImportScope[] = districtNames.map((name) => ({
    crop,
    state: sourceState,
    district: name,
  }));
  const reportRuns = () => {
    status.runs = { district: districtRunInfo(districtScopes), state: runInfo(stateScope) };
  };
  const describe = (scope: "district" | "state", coverage: Coverage, need: ImportNeed) => {
    status.scope = scope;
    status.savedReports = coverage.allCount;
    status.newestDate = coverage.latestAny;
    status.oldestDate = coverage.history.oldestDate;
    status.needed = need.needed;
    status.reason = need.needed && !configured ? "not_configured" : need.reason;
  };
  const unavailable = () => {
    status.reason = "unavailable";
    reportRuns();
    return { status, run: null };
  };
  const canStart =
    configured &&
    Boolean(accessToken) &&
    secondsUntilExpiry(accessToken ?? "") >= MINIMUM_TOKEN_SECONDS;

  let claimed: {
    scope: ImportScope;
    coverage: SavedCoverage;
    heldState: boolean;
    /** Reports saved for the district, under any of its names, before this fetch. */
    districtRows: number;
  } | null = null;
  let stateIsNext = districtScopes.length === 0;

  if (districtScopes.length > 0) {
    // The district as a whole: its reports may be saved under more than one name.
    const whole = await loadCoverage(supabase, districtScopes[0], today, districtNames);
    if (!whole) return unavailable();
    const need = assessImportNeed(whole.history, today, historyDaysFor(districtScopes[0]));
    describe("district", whole, need);
    if (need.needed) {
      for (const scope of districtScopes) {
        if (!canStart || !token || knownBusy(scope)) continue;
        if (!(await claim(supabase, token, scope))) continue;
        // Each name is read on from its own saved rows, not the district's total.
        const own = districtScopes.length > 1 ? await loadCoverage(supabase, scope, today) : whole;
        if (!own) {
          await releaseHeldClaim(supabase, token, scope, 60);
          continue;
        }
        // A district with nothing saved may turn out to have no mandi for this
        // crop, and then the state is fetched instead. Its claim is taken now,
        // so that nobody starts that larger fetch while this one is running.
        const heldState =
          whole.allCount === 0 &&
          !knownBusy(stateScope) &&
          (await claim(supabase, token, stateScope));
        claimed = { scope, coverage: own.history, heldState, districtRows: whole.allCount };
        noteRunning(scope);
        break;
      }
      // Only a district with nothing saved goes on to the state. Its own fetch
      // is running, was tried a moment ago, or found no mandi there; in the
      // first two cases the state's claim is held too, so nothing starts twice.
      stateIsNext = !claimed && whole.allCount === 0;
    }
  }

  if (stateIsNext) {
    const coverage = await loadCoverage(supabase, stateScope, today);
    if (!coverage) return unavailable();
    const need = assessImportNeed(coverage.history, today, historyDaysFor(stateScope));
    // Report the district when it has any reports; otherwise whatever the state has.
    if (status.scope === null || coverage.allCount > 0) describe("state", coverage, need);
    if (
      need.needed &&
      canStart &&
      token &&
      !knownBusy(stateScope) &&
      (await claim(supabase, token, stateScope))
    ) {
      claimed = {
        scope: stateScope,
        coverage: coverage.history,
        heldState: false,
        districtRows: 0,
      };
      noteRunning(stateScope);
    }
  }
  reportRuns();

  const weatherInput = {
    crop,
    state: sourceState,
    preferredDistrict: districtNames[0] ?? district,
  };
  if (!claimed || !apiKey || !token || !accessToken) {
    // Prices are complete or already being fetched. The weather-aware forecast
    // still needs district weather, so make sure that is there too.
    const weatherKeyName = `${crop}|${sourceState}`.toLowerCase();
    if (
      !token ||
      !accessToken ||
      !weatherIsEnabled() ||
      status.savedReports === 0 ||
      secondsUntilExpiry(accessToken) < WEATHER_ONLY_TOKEN_SECONDS ||
      recentWeatherChecks.get(weatherKeyName)
    ) {
      return { status, run: null };
    }
    recentWeatherChecks.set(weatherKeyName, true, 5 * 60_000);
    status.weatherStarted = true;
    return {
      status,
      run: async () => {
        try {
          await ensureDistrictWeather(
            createUserTokenClient(accessToken),
            token,
            weatherInput,
            Date.now() + WEATHER_ONLY_BUDGET_MS,
          );
        } catch {
          // Weather is an extra input; prices and the other forecasts do not depend on it.
        }
      },
    };
  }
  status.started = true;
  status.weatherStarted = weatherIsEnabled();

  const first = claimed;
  const run = async () => {
    const startedAt = Date.now();
    const deadline = startedAt + TIME_BUDGET_MS;
    const db = createUserTokenClient(accessToken);
    let holdingState = first.heldState;
    try {
      const result = await runClaimed(
        db,
        token,
        apiKey,
        first.scope,
        first.coverage,
        trigger,
        deadline,
      );
      if (first.scope.district) {
        const timeLeft = () => Date.now() < deadline - 30_000;
        let nothingFound = first.districtRows === 0 && result?.outcome === "no_data";
        // The same district under the other names the source uses for it.
        for (const scope of districtScopes) {
          if (scope === first.scope || !timeLeft()) continue;
          if (!(await claim(db, token, scope))) continue;
          const coverage = await loadCoverage(db, scope, today);
          if (!coverage) {
            await releaseHeldClaim(db, token, scope, 60);
            continue;
          }
          const other = await runClaimed(
            db,
            token,
            apiKey,
            scope,
            coverage.history,
            trigger,
            deadline,
          );
          if (other?.outcome !== "no_data") nothingFound = false;
        }
        // Nothing at the source for this district: fall back to the state.
        if (nothingFound && timeLeft()) {
          const coverage = await loadCoverage(db, stateScope, today);
          if (
            coverage &&
            assessImportNeed(coverage.history, today, historyDaysFor(stateScope)).needed &&
            (holdingState || (await claim(db, token, stateScope)))
          ) {
            holdingState = false; // the state run below gives the claim back itself
            await runClaimed(db, token, apiKey, stateScope, coverage.history, trigger, deadline);
          }
        }
      }
      if (holdingState) {
        holdingState = false;
        await releaseHeldClaim(db, token, stateScope, heldRetrySeconds(result));
      }
      await ensureDistrictWeather(db, token, weatherInput, startedAt + WEATHER_BUDGET_MS);
    } catch (error) {
      logEvent("error", "market_auto_import_crashed", {
        message: error instanceof Error ? error.message : "unknown error",
      });
    } finally {
      if (holdingState) {
        await releaseHeldClaim(db, token, stateScope, 60).catch(() => undefined);
      }
    }
  };
  return { status, run };
}

/**
 * Convenience for routes that save a lot or a requirement: start fetching
 * prices for that crop in the user's own area, without delaying the response.
 */
export async function scheduleMarketHistory(
  input: { crop: string; state: string | null; district: string | null },
  trigger: ImportTrigger,
): Promise<void> {
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getSession();
    const accessToken = data.session?.access_token;
    if (!accessToken) return;
    // Everything happens after the response, so saving is never slowed down.
    after(async () => {
      try {
        const prepared = await prepareMarketHistory(
          createUserTokenClient(accessToken),
          accessToken,
          input,
          trigger,
        );
        await prepared.run?.();
      } catch {
        // A background convenience: the lot or requirement is already saved.
      }
    });
  } catch {
    // Never let a background convenience break saving the lot or requirement.
  }
}
