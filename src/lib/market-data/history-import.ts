import type { MarketObservationImportRow } from "./import-batch.ts";
import { normalizeOgdResponseWithDiagnostics, SOURCE_NAME } from "./normalize.ts";
import {
  fetchOgdHistory,
  historyDateToIso,
  OGD_HISTORY_RESOURCE_URL,
  type HistoryFetchDeps,
  type OgdHistoryRequest,
  type OgdHistoryResult,
} from "./ogd-history.ts";
import type { MarketPriceRecord, MarketSourceQuality } from "./types.ts";

/**
 * Shared steps of every past-price import (the admin's manual import and the
 * automatic one that runs when a farmer or buyer looks up a crop): continue
 * from what is already saved, and turn source records into database rows.
 */

/** What Farmess already holds from the history source for the same filters and period. */
export type SavedCoverage = {
  savedCount: number;
  newestDate: string | null;
  oldestDate: string | null;
};

function rupeesToPaise(value: string | null): number | null | undefined {
  if (value === null) return null;
  const paise = Math.round(Number(value) * 100);
  return Number.isSafeInteger(paise) && paise >= 0 ? paise : undefined;
}

/** Validated price records -> rows for market_observations. Future-dated rows are dropped. */
export function priceRecordsToRows(
  records: readonly MarketPriceRecord[],
  retrievedAt: string,
  sourceUrl: string,
): MarketObservationImportRow[] {
  const today = retrievedAt.slice(0, 10);
  return records
    .filter((record) => record.observationDate <= today)
    .flatMap((record) => {
      const min = rupeesToPaise(record.minPrice);
      const max = rupeesToPaise(record.maxPrice);
      const modal = rupeesToPaise(record.modalPrice);
      if (min === undefined || max === undefined || modal === undefined) return [];
      return [
        {
          crop: record.commodity,
          variety: record.variety,
          district: record.district,
          state: record.state,
          market_name: record.market,
          min_price_paise_per_quintal: min,
          max_price_paise_per_quintal: max,
          modal_price_paise_per_quintal: modal,
          observation_date: record.observationDate,
          retrieved_at: retrievedAt,
          source_name: SOURCE_NAME,
          source_url: sourceUrl,
        },
      ];
    });
}

/** Raw history-resource records -> validated rows, with the source-quality counts. */
export function historyRecordsToRows(
  records: Record<string, unknown>[],
  retrievedAt: string,
): { rows: MarketObservationImportRow[]; quality: MarketSourceQuality } {
  const normalized = normalizeOgdResponseWithDiagnostics({ records }, retrievedAt);
  return {
    rows: priceRecordsToRows(normalized.records, retrievedAt, OGD_HISTORY_RESOURCE_URL),
    quality: normalized.quality,
  };
}

/**
 * Fetch history newest-first, continuing an earlier import for the same
 * filters: first the days newer than the newest saved one, then further back
 * from roughly where the earlier run stopped (the saved-row count is used as
 * the source offset, so some already-saved rows may be read again; they are
 * simply overwritten with the same values).
 */
export async function fetchHistoryContinuing(
  base: Omit<OgdHistoryRequest, "fromDate" | "startOffset">,
  fromDate: string,
  coverage: Pick<SavedCoverage, "savedCount" | "newestDate">,
  deps: HistoryFetchDeps = {},
): Promise<OgdHistoryResult> {
  const newestSaved = coverage.newestDate;
  const first = await fetchOgdHistory(
    { ...base, fromDate: newestSaved && newestSaved > fromDate ? newestSaved : fromDate },
    deps,
  );
  const reachedEnd =
    first.stopReason === "reached_start_date" || first.stopReason === "no_more_records";
  if (!newestSaved || coverage.savedCount <= 0 || !reachedEnd) return first;

  const fresh = first.records.filter(
    (record) => (historyDateToIso(record.arrival_date) ?? "") > newestSaved,
  ).length;
  const older = await fetchOgdHistory(
    {
      ...base,
      fromDate,
      startOffset: coverage.savedCount + fresh,
      maxRecords: Math.max(1, base.maxRecords - first.records.length),
    },
    deps,
  );
  const dates = [first.oldestDate, older.oldestDate, first.newestDate, older.newestDate]
    .filter((value): value is string => Boolean(value))
    .sort();
  return {
    records: [...first.records, ...older.records],
    requests: first.requests + older.requests,
    pageSize: first.pageSize ?? older.pageSize,
    sourceTotal: first.sourceTotal ?? older.sourceTotal,
    rowsRead: first.rowsRead + older.rowsRead,
    oldestDate: dates[0] ?? null,
    newestDate: dates[dates.length - 1] ?? null,
    stopReason: older.stopReason,
    ...(older.errorMessage ? { errorMessage: older.errorMessage } : {}),
  };
}
