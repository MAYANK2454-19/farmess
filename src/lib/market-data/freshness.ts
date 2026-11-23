export type MarketDataFreshness = "fresh" | "stale" | "future" | "invalid";

export interface MarketDataFreshnessResult {
  status: MarketDataFreshness;
  ageHours: number | null;
  message: string;
}

const DEFAULT_MAX_AGE_HOURS = 48;

function isRealCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(0, 0, 0, 0);

  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

export function assessMarketDataFreshness(
  observationDate: string,
  now = new Date(),
  maxAgeHours = DEFAULT_MAX_AGE_HOURS,
): MarketDataFreshnessResult {
  if (!isRealCalendarDate(observationDate)) {
    return { status: "invalid", ageHours: null, message: "Observation date is invalid." };
  }

  if (!Number.isFinite(maxAgeHours) || maxAgeHours < 0) {
    throw new RangeError("maxAgeHours must be a finite non-negative number.");
  }

  const observation = new Date(observationDate + "T00:00:00.000Z");
  const ageHours = (now.getTime() - observation.getTime()) / 3_600_000;

  if (ageHours < 0) {
    return {
      status: "future",
      ageHours,
      message:
        "Observation date is in the future and should not be presented as current market data.",
    };
  }

  if (ageHours > maxAgeHours) {
    return {
      status: "stale",
      ageHours,
      message:
        "Observation is older than the configured " + maxAgeHours + "-hour freshness window.",
    };
  }

  return {
    status: "fresh",
    ageHours,
    message: "Observation is within the configured freshness window.",
  };
}
