export type OgdPageFetcher = (url: URL, init: RequestInit) => Promise<Response>;

const OGD_PAGE_SIZE = 100;
const OGD_TOTAL_TIMEOUT_MS = 10_000;

function readRecords(payload: unknown): unknown[] {
  if (
    !payload ||
    typeof payload !== "object" ||
    !Array.isArray((payload as { records?: unknown }).records)
  ) {
    throw new Error("OGD response schema mismatch: expected a records array.");
  }

  return (payload as { records: unknown[] }).records;
}

/**
 * Fetch a bounded OGD result set in pages.
 *
 * Any failed page rejects the complete operation so callers never mistake a
 * partial source response for a complete result set.
 */
export async function fetchOgdRecordsPaginated(
  endpoint: URL,
  requestedLimit: number,
  fetchPage: OgdPageFetcher = fetch,
): Promise<unknown[]> {
  if (!Number.isSafeInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 500) {
    throw new RangeError("OGD record limit must be a whole number from 1 to 500.");
  }

  const records: unknown[] = [];
  const signal = AbortSignal.timeout(OGD_TOTAL_TIMEOUT_MS);

  while (records.length < requestedLimit) {
    const pageLimit = Math.min(OGD_PAGE_SIZE, requestedLimit - records.length);
    const pageUrl = new URL(endpoint);
    pageUrl.searchParams.set("limit", String(pageLimit));
    pageUrl.searchParams.set("offset", String(records.length));

    const response = await fetchPage(pageUrl, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal,
    });

    if (!response.ok) {
      throw new Error(`OGD India returned HTTP ${response.status}.`);
    }

    const pageRecords = readRecords(await response.json());
    records.push(...pageRecords.slice(0, pageLimit));

    if (pageRecords.length < pageLimit) break;
  }

  return records;
}
