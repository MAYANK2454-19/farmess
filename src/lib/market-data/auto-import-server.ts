import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { after } from "next/server";
import { canonicalDistrict, canonicalState, ogdStateName } from "@/lib/location/india";
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

export type ImportTrigger = "search" | "lot" | "requirement";

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
};

type Coverage = { history: SavedCoverage; allCount: number; latestAny: string | null };

/** ilike is used as a case-insensitive equals, so pattern characters are removed. */
const exact = (value: string) => value.replace(/[%_*\\]/g, " ").trim();

async function loadCoverage(db: Db, scope: ImportScope, today: string): Promise<Coverage | null> {
  const fromDate = isoDaysBefore(today, historyDaysFor(scope));
  const base = (withCount: boolean) => {
    let query = db
      .from("market_observations")
      .select("observation_date", withCount ? { count: "exact" } : undefined)
      .ilike("crop", exact(scope.crop))
      .ilike("state", exact(scope.state))
      .gte("observation_date", fromDate);
    if (scope.district) query = query.ilike("district", exact(scope.district));
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
  try {
    // Today's reports first: they are few, and they are what people look at first.
    await fetchAndSaveCurrent(db, token, scope, trigger).catch(() => 0);
    result = await runAutoImport({
      apiKey,
      scope,
      coverage,
      today: new Date().toISOString().slice(0, 10),
      deadline,
      ingest: (rows, received, note) =>
        ingestHistory(db, token, scope, trigger, rows, received, note),
    });
    outcome = result.outcome;
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
  };
  if (!crop || !canonState) return { status, run: null };

  const sourceState = ogdStateName(canonState);
  const today = new Date().toISOString().slice(0, 10);
  const stateScope: ImportScope = { crop, state: sourceState, district: null };
  const scopes: ImportScope[] = district
    ? [{ crop, state: sourceState, district }, stateScope]
    : [stateScope];
  const canStart =
    configured &&
    Boolean(accessToken) &&
    secondsUntilExpiry(accessToken ?? "") >= MINIMUM_TOKEN_SECONDS;

  let claimed: { scope: ImportScope; coverage: SavedCoverage } | null = null;
  let districtUnavailable = false;
  for (const scope of scopes) {
    const coverage = await loadCoverage(supabase, scope, today);
    if (!coverage) {
      status.reason = "unavailable";
      return { status, run: null };
    }
    // The district's own fetch is running or was tried recently and nothing is
    // saved for the state either: wait for it rather than start a second,
    // much larger fetch for the whole state.
    if (districtUnavailable && coverage.allCount === 0) break;
    const need = assessImportNeed(coverage.history, today, historyDaysFor(scope));
    // Report the district when it has any reports; otherwise whatever the state has.
    if (status.scope === null || coverage.allCount > 0) {
      status.scope = scope.district ? "district" : "state";
      status.savedReports = coverage.allCount;
      status.newestDate = coverage.latestAny;
      status.oldestDate = coverage.history.oldestDate;
      status.needed = need.needed;
      status.reason = need.needed && !configured ? "not_configured" : need.reason;
    }
    if (!need.needed) break;
    if (canStart && token && (await claim(supabase, token, scope))) {
      claimed = { scope, coverage: coverage.history };
      break;
    }
    // A district with nothing saved may simply have no mandi for this crop.
    // If the state already has reports for it (an earlier fetch found none in
    // the district and went on to the state), keep that state history current.
    if (!(scope.district && coverage.allCount === 0)) break;
    districtUnavailable = true;
  }

  const weatherInput = { crop, state: sourceState, preferredDistrict: district };
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
    try {
      const db = createUserTokenClient(accessToken);
      const result = await runClaimed(
        db,
        token,
        apiKey,
        first.scope,
        first.coverage,
        trigger,
        deadline,
      );
      // Nothing at the source for this district: fall back to the state.
      if (first.scope.district && result?.outcome === "no_data" && Date.now() < deadline - 30_000) {
        const coverage = await loadCoverage(db, stateScope, today);
        if (
          coverage &&
          assessImportNeed(coverage.history, today, historyDaysFor(stateScope)).needed &&
          (await claim(db, token, stateScope))
        ) {
          await runClaimed(db, token, apiKey, stateScope, coverage.history, trigger, deadline);
        }
      }
      await ensureDistrictWeather(db, token, weatherInput, startedAt + WEATHER_BUDGET_MS);
    } catch (error) {
      logEvent("error", "market_auto_import_crashed", {
        message: error instanceof Error ? error.message : "unknown error",
      });
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
