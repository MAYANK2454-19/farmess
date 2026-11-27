import {
  reconcileMarketObservationHistory,
  type MarketObservationImportRow,
} from "./import-batch.ts";
import {
  fetchHistoryContinuing,
  historyRecordsToRows,
  type SavedCoverage,
} from "./history-import.ts";
import {
  historyDateToIso,
  type HistoryFetchDeps,
  type OgdHistoryStopReason,
} from "./ogd-history.ts";

/**
 * Automatic past-price import. When a farmer or buyer looks up a crop for their
 * district, Farmess fetches that crop's reported mandi prices from data.gov.in
 * itself, so nobody has to import data by hand. This file holds the rules
 * (what is missing, how far to go, when to try again) and the import loop;
 * the database and network are passed in so the loop can be tested.
 */

export const DISTRICT_HISTORY_DAYS = 365;
/** A whole state can be tens of thousands of rows, so it is kept shorter. */
export const STATE_HISTORY_DAYS = 120;
export const DISTRICT_MAX_RECORDS = 20_000;
export const STATE_MAX_RECORDS = 4_000;
/** New reports normally appear within a day or two (mandis close on some days). */
const TOP_UP_AFTER_DAYS = 2;
/** History counts as reaching the start when it gets within this many days of it. */
const START_TOLERANCE_DAYS = 14;
const FLUSH_ROWS = 400;
const FLUSH_INTERVAL_MS = 30_000;
/**
 * The first rows are saved early: they are the newest prices, and the person
 * who asked should see them within seconds, not after the whole year is read.
 */
const FIRST_FLUSH_ROWS = 30;
const FIRST_FLUSH_MS = 8_000;
/**
 * data.gov.in often answers "slow down" (HTTP 429) for a few seconds at a
 * time, especially on the shared sample key. Someone is waiting on the page, so
 * a background fetch keeps trying for close to three minutes before giving up.
 */
export const AUTO_RATE_LIMIT_WAITS_MS = [5_000, 10_000, 20_000, 30_000, 45_000, 60_000] as const;
const INGEST_CHUNK = 1_000;
const MS_PER_DAY = 86_400_000;

export type ImportScope = { crop: string; state: string; district: string | null };

/** One claim per crop and area, so two people searching together start one import. */
export function importSeriesKey(scope: ImportScope): string {
  const part = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");
  return [part(scope.crop), part(scope.state), scope.district ? part(scope.district) : "*"]
    .join("|")
    .slice(0, 300);
}

export function historyDaysFor(scope: ImportScope): number {
  return scope.district ? DISTRICT_HISTORY_DAYS : STATE_HISTORY_DAYS;
}

export function isoDaysBefore(today: string, days: number): string {
  return new Date(Date.parse(`${today}T00:00:00.000Z`) - days * MS_PER_DAY)
    .toISOString()
    .slice(0, 10);
}

export type ImportNeedReason = "nothing_saved" | "newer_days" | "older_days" | "up_to_date";
export type ImportNeed = { needed: boolean; reason: ImportNeedReason };

/** Is anything missing for this crop and area, judged only from what is saved? */
export function assessImportNeed(coverage: SavedCoverage, today: string, days: number): ImportNeed {
  if (coverage.savedCount <= 0 || !coverage.newestDate || !coverage.oldestDate) {
    return { needed: true, reason: "nothing_saved" };
  }
  if (coverage.newestDate < isoDaysBefore(today, TOP_UP_AFTER_DAYS)) {
    return { needed: true, reason: "newer_days" };
  }
  if (coverage.oldestDate > isoDaysBefore(today, days - START_TOLERANCE_DAYS)) {
    return { needed: true, reason: "older_days" };
  }
  return { needed: false, reason: "up_to_date" };
}

export type ImportOutcome =
  "complete" | "partial" | "rate_limited" | "source_error" | "no_data" | "save_error";

/** How long to wait before the same crop and area may be fetched again. */
export function retrySecondsFor(outcome: ImportOutcome): number {
  switch (outcome) {
    case "complete":
      return 6 * 3600;
    case "partial":
      // Stopped only because one run may not last longer: carry on almost at once.
      return 60;
    case "rate_limited":
      // The run itself already waited for minutes; try again soon, the page may still be open.
      return 180;
    case "no_data":
      return 24 * 3600;
    case "source_error":
      return 300;
    case "save_error":
      return 900;
  }
}

export function outcomeFor(input: {
  stopReason: OgdHistoryStopReason;
  saved: number;
  savedBefore: number;
  saveFailed: boolean;
}): ImportOutcome {
  if (input.saveFailed) return "save_error";
  switch (input.stopReason) {
    case "rate_limited":
      return "rate_limited";
    case "source_error":
      return "source_error";
    case "time_limit":
    case "max_records":
      return "partial";
    case "reached_start_date":
    case "no_more_records":
      return input.saved === 0 && input.savedBefore === 0 ? "no_data" : "complete";
  }
}

/**
 * The source lists reports newest first, so the oldest date in a batch may
 * continue on the next page. Rows of that date are held back, which keeps all
 * of a day's rows together when conflicting duplicates are checked.
 */
export function splitCompleteDates(records: Record<string, unknown>[]): {
  complete: Record<string, unknown>[];
  pending: Record<string, unknown>[];
} {
  let oldest: string | null = null;
  for (const record of records) {
    const date = historyDateToIso(record.arrival_date);
    if (date && (!oldest || date < oldest)) oldest = date;
  }
  if (!oldest) return { complete: records, pending: [] };
  const complete: Record<string, unknown>[] = [];
  const pending: Record<string, unknown>[] = [];
  for (const record of records) {
    (historyDateToIso(record.arrival_date) === oldest ? pending : complete).push(record);
  }
  return { complete, pending };
}

export type IngestRow = Pick<
  MarketObservationImportRow,
  | "crop"
  | "variety"
  | "state"
  | "district"
  | "market_name"
  | "min_price_paise_per_quintal"
  | "max_price_paise_per_quintal"
  | "modal_price_paise_per_quintal"
  | "observation_date"
>;

export function toIngestRow(row: MarketObservationImportRow): IngestRow {
  return {
    crop: row.crop,
    variety: row.variety,
    state: row.state,
    district: row.district,
    market_name: row.market_name,
    min_price_paise_per_quintal: row.min_price_paise_per_quintal,
    max_price_paise_per_quintal: row.max_price_paise_per_quintal,
    modal_price_paise_per_quintal: row.modal_price_paise_per_quintal,
    observation_date: row.observation_date,
  };
}

export type AutoImportResult = {
  outcome: ImportOutcome;
  stopReason: OgdHistoryStopReason;
  /** Rows the database accepted. */
  saved: number;
  /** Source records read for the requested period. */
  received: number;
  /** Rows the source holds for these filters across all dates, when reported. */
  sourceTotal: number | null;
  conflictingKeysWithheld: number;
  note: string | null;
};

export type AutoImportInput = {
  apiKey: string;
  scope: ImportScope;
  coverage: SavedCoverage;
  /** YYYY-MM-DD in UTC. */
  today: string;
  /** Epoch ms after which no new source request is started. */
  deadline: number;
  /** Saves rows and returns how many the database accepted; throws when it cannot save. */
  ingest: (rows: IngestRow[], received: number, note: string | null) => Promise<number>;
  /** Told each time the source asks to slow down, so the person waiting can be told too. */
  onRateLimit?: (waitMs: number) => void;
  /** Told after each page the source answers and after each save: rows saved and read so far. */
  onProgress?: (progress: { saved: number; received: number }) => void;
  deps?: HistoryFetchDeps;
};

/**
 * Fetch what is missing for one crop and area and save it as it arrives, so
 * progress survives a rate limit or a time limit.
 */
export async function runAutoImport(input: AutoImportInput): Promise<AutoImportResult> {
  const now = input.deps?.now ?? Date.now;
  const days = historyDaysFor(input.scope);
  const fromDate = isoDaysBefore(input.today, days);

  let buffer: Record<string, unknown>[] = [];
  let lastFlush = now();
  let saved = 0;
  let received = 0;
  let conflicts = 0;
  let calls = 0;
  let saveFailed = false;

  async function flush(final: boolean, note: string | null = null) {
    if (saveFailed) return;
    const { complete, pending } = final
      ? { complete: buffer, pending: [] as Record<string, unknown>[] }
      : splitCompleteDates(buffer);
    buffer = pending;
    lastFlush = now();
    if (complete.length === 0) return;
    const { rows } = historyRecordsToRows(complete, new Date(now()).toISOString());
    const batch = reconcileMarketObservationHistory(rows);
    conflicts += batch.conflictingKeysWithheld;
    const ready = batch.rows.map(toIngestRow);
    let pendingReceived = complete.length;
    for (let i = 0; i < ready.length || (i === 0 && pendingReceived > 0); i += INGEST_CHUNK) {
      try {
        saved += await input.ingest(ready.slice(i, i + INGEST_CHUNK), pendingReceived, note);
        calls += 1;
        input.onProgress?.({ saved, received });
      } catch {
        saveFailed = true;
        return;
      }
      pendingReceived = 0;
    }
  }

  const history = await fetchHistoryContinuing(
    {
      apiKey: input.apiKey,
      commodity: input.scope.crop,
      state: input.scope.state,
      district: input.scope.district ?? undefined,
      maxRecords: input.scope.district ? DISTRICT_MAX_RECORDS : STATE_MAX_RECORDS,
      deadline: input.deadline,
      rateLimitWaitsMs: AUTO_RATE_LIMIT_WAITS_MS,
      onRateLimit: input.onRateLimit,
      onRecords: async (records) => {
        received += records.length;
        buffer.push(...records);
        const waited = now() - lastFlush;
        const due =
          calls === 0
            ? buffer.length >= FIRST_FLUSH_ROWS || waited >= FIRST_FLUSH_MS
            : buffer.length >= FLUSH_ROWS || waited >= FLUSH_INTERVAL_MS;
        if (due) await flush(false);
        input.onProgress?.({ saved, received });
      },
    },
    fromDate,
    input.coverage,
    input.deps,
  );
  const stopNote =
    history.errorMessage ??
    (history.stopReason === "time_limit"
      ? "Stopped at the time limit; the next lookup continues further back."
      : history.stopReason === "max_records"
        ? "Stopped at the row limit for one run; the next lookup continues."
        : null);
  await flush(true, stopNote);

  const outcome = outcomeFor({
    stopReason: history.stopReason,
    saved,
    savedBefore: input.coverage.savedCount,
    saveFailed,
  });
  const note = saveFailed ? "Some rows could not be saved to the database." : stopNote;

  // Leave an audit entry even when nothing could be saved.
  if (calls === 0 && !saveFailed) {
    try {
      await input.ingest([], received, note ?? "The source returned no rows for this period.");
    } catch {
      // The outcome below already says what happened; the audit entry is best-effort.
    }
  }

  return {
    outcome,
    stopReason: history.stopReason,
    saved,
    received,
    sourceTotal: history.sourceTotal,
    conflictingKeysWithheld: conflicts,
    note,
  };
}
