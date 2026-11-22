import type { MarketPriceRecord, MarketPriceValueType } from "./types.ts";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const SUPPORTED_CURRENCY = "INR";
const SUPPORTED_PRICE_UNIT = "INR/quintal";

export type MarketHistoryPoint = {
  id: string;
  observationDate: string;
  retrievedAt: string;
  minPrice: string | null;
  maxPrice: string | null;
  modalPrice: string | null;
  sourceName: string;
  sourceUrl: string;
  sourcePriceUnit: string;
  valueType: MarketPriceValueType;
};

export type MarketHistoryGap = {
  fromDate: string;
  toDate: string;
  missingDays: number;
};

export type MarketHistorySeries = {
  id: string;
  commodity: string;
  variety: string | null;
  state: string;
  district: string;
  market: string;
  sourceName: string;
  sourceUrl: string;
  currency: typeof SUPPORTED_CURRENCY;
  priceUnit: typeof SUPPORTED_PRICE_UNIT;
  sourcePriceUnit: string;
  valueType: MarketPriceValueType;
  status: "available" | "single_observation";
  observationCount: number;
  uniqueObservationDateCount: number;
  oldestObservationDate: string;
  latestObservationDate: string;
  points: MarketHistoryPoint[];
  gaps: MarketHistoryGap[];
};

export type RejectedMarketHistoryRecord = {
  recordId: string;
  reason: string;
};

export type MarketHistoryBuildResult = {
  status: "available" | "insufficient_history" | "no_data";
  series: MarketHistorySeries[];
  rejectedRecords: RejectedMarketHistoryRecord[];
  discardedDuplicateCount: number;
};

type SeriesBucket = {
  firstRecord: MarketPriceRecord;
  pointsById: Map<string, MarketHistoryPoint>;
};

function normaliseText(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-IN");
}

function formatPaise(value: bigint): string {
  const rupees = value / 100n;
  const paise = (value % 100n).toString().padStart(2, "0");

  return rupees.toString() + "." + paise;
}

function parsePrice(value: unknown): bigint | null | undefined {
  if (value === null) return null;
  if (typeof value !== "string") return undefined;

  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) return undefined;

  const fraction = (match[2] ?? "").padEnd(2, "0");
  return BigInt(match[1]) * 100n + BigInt(fraction || "0");
}

function parseObservationDate(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;

  const parsed = new Date(value + "T00:00:00.000Z");
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    return null;
  }

  return value;
}

function isValidTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && Number.isFinite(Date.parse(value));
}

function isHttpUrl(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim()) return false;

  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function isNonEmptyText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validateRecord(
  record: MarketPriceRecord,
): { point: MarketHistoryPoint } | { reason: string } {
  if (!isNonEmptyText(record.id)) return { reason: "Record ID is missing." };
  if (
    !isNonEmptyText(record.commodity) ||
    !isNonEmptyText(record.state) ||
    !isNonEmptyText(record.district) ||
    !isNonEmptyText(record.market)
  ) {
    return { reason: "Commodity, state, district and market are required." };
  }
  if (!isNonEmptyText(record.sourceName) || !isHttpUrl(record.sourceUrl)) {
    return { reason: "A source name and valid HTTP(S) source URL are required." };
  }
  if (!isNonEmptyText(record.sourcePriceUnit)) {
    return { reason: "The source price unit is missing." };
  }
  if (record.currency !== SUPPORTED_CURRENCY || record.priceUnit !== SUPPORTED_PRICE_UNIT) {
    return { reason: "Only INR/quintal observations are supported by this history series." };
  }
  if (record.valueType !== "reported" && record.valueType !== "demo") {
    return { reason: "The market value type is not supported." };
  }

  const observationDate = parseObservationDate(record.observationDate);
  if (!observationDate) return { reason: "Observation date must be a valid YYYY-MM-DD date." };
  if (!isValidTimestamp(record.retrievedAt)) {
    return { reason: "Retrieval timestamp must be valid." };
  }

  const min = parsePrice(record.minPrice);
  const max = parsePrice(record.maxPrice);
  const modal = parsePrice(record.modalPrice);

  if (min === undefined || max === undefined || modal === undefined) {
    return { reason: "Prices must be non-negative values with at most two decimal places." };
  }
  if (min === null && max === null && modal === null) {
    return { reason: "At least one reported price value is required." };
  }
  if (
    (min !== null && max !== null && min > max) ||
    (modal !== null && min !== null && modal < min) ||
    (modal !== null && max !== null && modal > max)
  ) {
    return { reason: "Minimum, modal and maximum prices are inconsistent." };
  }

  return {
    point: {
      id: record.id.trim(),
      observationDate,
      retrievedAt: record.retrievedAt,
      minPrice: min === null ? null : formatPaise(min),
      maxPrice: max === null ? null : formatPaise(max),
      modalPrice: modal === null ? null : formatPaise(modal),
      sourceName: record.sourceName.trim(),
      sourceUrl: record.sourceUrl.trim(),
      sourcePriceUnit: record.sourcePriceUnit.trim(),
      valueType: record.valueType,
    },
  };
}

function groupingKey(record: MarketPriceRecord): string {
  return JSON.stringify([
    normaliseText(record.commodity),
    record.variety === null ? null : normaliseText(record.variety),
    normaliseText(record.state),
    normaliseText(record.district),
    normaliseText(record.market),
    normaliseText(record.sourceName),
    record.sourceUrl.trim(),
    record.currency,
    record.priceUnit,
    normaliseText(record.sourcePriceUnit),
    record.valueType,
  ]);
}

function addDays(date: string, days: number): string {
  return new Date(Date.parse(date + "T00:00:00.000Z") + days * MS_PER_DAY)
    .toISOString()
    .slice(0, 10);
}

function buildGaps(points: readonly MarketHistoryPoint[]): MarketHistoryGap[] {
  const dates = [...new Set(points.map((point) => point.observationDate))].sort();
  const gaps: MarketHistoryGap[] = [];

  for (let index = 1; index < dates.length; index += 1) {
    const previous = dates[index - 1];
    const current = dates[index];
    const daysBetween =
      (Date.parse(current + "T00:00:00.000Z") - Date.parse(previous + "T00:00:00.000Z")) /
      MS_PER_DAY;

    if (daysBetween > 1) {
      gaps.push({
        fromDate: addDays(previous, 1),
        toDate: addDays(current, -1),
        missingDays: daysBetween - 1,
      });
    }
  }

  return gaps;
}

function comparePoints(left: MarketHistoryPoint, right: MarketHistoryPoint): number {
  return (
    left.observationDate.localeCompare(right.observationDate) ||
    left.retrievedAt.localeCompare(right.retrievedAt) ||
    left.id.localeCompare(right.id)
  );
}

/**
 * Build provenance-preserving time series without filling missing dates.
 *
 * Reported and demo observations are kept in separate series. Duplicate IDs
 * within a series retain the latest retrieved version. A gap describes dates
 * with no observation; it never creates an interpolated or predicted point.
 */
export function buildMarketHistorySeries(
  records: readonly MarketPriceRecord[],
): MarketHistoryBuildResult {
  const buckets = new Map<string, SeriesBucket>();
  const rejectedRecords: RejectedMarketHistoryRecord[] = [];
  let discardedDuplicateCount = 0;

  for (const record of records) {
    const validated = validateRecord(record);

    if ("reason" in validated) {
      rejectedRecords.push({
        recordId: isNonEmptyText(record?.id) ? record.id : "unknown",
        reason: validated.reason,
      });
      continue;
    }

    const key = groupingKey(record);
    const bucket = buckets.get(key) ?? {
      firstRecord: record,
      pointsById: new Map<string, MarketHistoryPoint>(),
    };
    const existing = bucket.pointsById.get(validated.point.id);

    if (existing) {
      discardedDuplicateCount += 1;
      if (Date.parse(validated.point.retrievedAt) > Date.parse(existing.retrievedAt)) {
        bucket.pointsById.set(validated.point.id, validated.point);
      }
    } else {
      bucket.pointsById.set(validated.point.id, validated.point);
    }

    buckets.set(key, bucket);
  }

  const series = [...buckets.entries()].map(([key, bucket]): MarketHistorySeries => {
    const record = bucket.firstRecord;
    const points = [...bucket.pointsById.values()].sort(comparePoints);
    const uniqueObservationDateCount = new Set(points.map((point) => point.observationDate)).size;
    const gaps = buildGaps(points);

    return {
      id: key,
      commodity: record.commodity.trim(),
      variety: record.variety?.trim() || null,
      state: record.state.trim(),
      district: record.district.trim(),
      market: record.market.trim(),
      sourceName: record.sourceName.trim(),
      sourceUrl: record.sourceUrl.trim(),
      currency: SUPPORTED_CURRENCY,
      priceUnit: SUPPORTED_PRICE_UNIT,
      sourcePriceUnit: record.sourcePriceUnit.trim(),
      valueType: record.valueType,
      status: uniqueObservationDateCount >= 2 ? "available" : "single_observation",
      observationCount: points.length,
      uniqueObservationDateCount,
      oldestObservationDate: points[0].observationDate,
      latestObservationDate: points[points.length - 1].observationDate,
      points,
      gaps,
    };
  });

  series.sort(
    (left, right) =>
      left.commodity.localeCompare(right.commodity) ||
      left.market.localeCompare(right.market) ||
      left.valueType.localeCompare(right.valueType),
  );

  const hasHistory = series.some((item) => item.status === "available");

  return {
    status: hasHistory ? "available" : series.length > 0 ? "insufficient_history" : "no_data",
    series,
    rejectedRecords,
    discardedDuplicateCount,
  };
}
