export type MarketSourceDateIntegrity =
  | { status: "valid" }
  | { status: "invalid-retrieval-time" }
  | { status: "invalid-observation-date"; observationDate: string }
  | { status: "future-observation"; futureDates: string[] };

function isValidCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/**
 * Verify that source observation dates are valid and do not post-date the
 * server retrieval date. Daily observations may share the retrieval date.
 */
export function assessMarketSourceDateIntegrity(
  observationDates: readonly string[],
  retrievedAt: string,
): MarketSourceDateIntegrity {
  const retrievalTime = new Date(retrievedAt);
  if (
    !/^\d{4}-\d{2}-\d{2}T/.test(retrievedAt) ||
    Number.isNaN(retrievalTime.getTime()) ||
    !isValidCalendarDate(retrievedAt.slice(0, 10))
  ) {
    return { status: "invalid-retrieval-time" };
  }

  const retrievalDate = retrievalAtDate(retrievedAt);

  for (const observationDate of observationDates) {
    if (!isValidCalendarDate(observationDate)) {
      return { status: "invalid-observation-date", observationDate };
    }
  }

  const futureDates = [...new Set(observationDates)]
    .filter((observationDate) => observationDate > retrievalDate)
    .sort();

  return futureDates.length > 0 ? { status: "future-observation", futureDates } : { status: "valid" };
}

function retrievalAtDate(retrievedAt: string): string {
  return retrievedAt.slice(0, 10);
}
