/**
 * Past mandi prices from OGD India's "Variety-wise Daily Market Prices Data of
 * Commodity" resource (AGMARKNET history back to 2006, updated daily).
 *
 * The live search uses the "current daily price" resource, which only holds
 * today's reports. This module walks the history resource newest-first and
 * stops once it has gone back the requested number of days.
 *
 * data.gov.in caps rows per request by key (the public sample key returns 10;
 * a personal key returns far more) and rate-limits bursts, so requests are
 * paced, retried after HTTP 429, and bounded by a deadline. Whatever was
 * fetched before a stop is still real, dated source data and is returned.
 */

export const OGD_HISTORY_RESOURCE_ID = "35985678-0d79-46b4-9ed6-6f13308a1d24";
export const OGD_HISTORY_API_URL = `https://api.data.gov.in/resource/${OGD_HISTORY_RESOURCE_ID}`;
export const OGD_HISTORY_RESOURCE_URL =
  "https://data.gov.in/resource/variety-wise-daily-market-prices-data-commodity";

const PAGE_SIZE = 1000;
const REQUEST_TIMEOUT_MS = 30_000;
const PAUSE_BETWEEN_REQUESTS_MS = 1_200;
const RATE_LIMIT_WAITS_MS = [5_000, 15_000, 30_000];

export type OgdHistoryRequest = {
  apiKey: string;
  commodity: string;
  state: string;
  district?: string;
  market?: string;
  /** Oldest observation date to keep, YYYY-MM-DD. */
  fromDate: string;
  maxRecords: number;
  /** Epoch ms after which no new request is started. */
  deadline: number;
  /** Source row to start from (to continue past rows already saved). */
  startOffset?: number;
};

export type OgdHistoryStopReason =
  | "reached_start_date"
  | "no_more_records"
  | "max_records"
  | "time_limit"
  | "rate_limited"
  | "source_error";

export type OgdHistoryResult = {
  /** Raw records with lower-case keys, ready for normalizeOgdResponseWithDiagnostics. */
  records: Record<string, unknown>[];
  requests: number;
  pageSize: number | null;
  oldestDate: string | null;
  newestDate: string | null;
  stopReason: OgdHistoryStopReason;
  errorMessage?: string;
};

export type HistoryFetchDeps = {
  fetchPage?: (url: URL, init: RequestInit) => Promise<Response>;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
};

/** "25/11/2026" or "2026-11-25" -> "2026-11-25"; anything else -> null. */
export function historyDateToIso(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  const dmy = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw);
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

/** History rows use Title_Case keys and padded names; normalise both. */
export function lowerCaseHistoryRecord(record: unknown): Record<string, unknown> | null {
  if (!record || typeof record !== "object" || Array.isArray(record)) return null;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    out[key.toLowerCase()] = typeof value === "string" ? value.trim() : value;
  }
  return out;
}

export function buildHistoryUrl(
  request: Pick<OgdHistoryRequest, "apiKey" | "commodity" | "state" | "district" | "market">,
  offset: number,
): URL {
  const url = new URL(OGD_HISTORY_API_URL);
  url.searchParams.set("api-key", request.apiKey);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", String(PAGE_SIZE));
  url.searchParams.set("offset", String(offset));
  url.searchParams.set("sort[Arrival_Date]", "desc");
  url.searchParams.set("filters[Commodity]", request.commodity);
  url.searchParams.set("filters[State]", request.state);
  if (request.district) url.searchParams.set("filters[District]", request.district);
  if (request.market) url.searchParams.set("filters[Market]", request.market);
  return url;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function fetchOgdHistory(
  request: OgdHistoryRequest,
  deps: HistoryFetchDeps = {},
): Promise<OgdHistoryResult> {
  const fetchPage = deps.fetchPage ?? fetch;
  const sleep = deps.sleep ?? defaultSleep;
  const now = deps.now ?? Date.now;

  const records: Record<string, unknown>[] = [];
  let requests = 0;
  let pageSize: number | null = null;
  let oldestDate: string | null = null;
  let newestDate: string | null = null;
  let offset = request.startOffset ?? 0;

  const finish = (stopReason: OgdHistoryStopReason, errorMessage?: string): OgdHistoryResult => ({
    records,
    requests,
    pageSize,
    oldestDate,
    newestDate,
    stopReason,
    ...(errorMessage ? { errorMessage } : {}),
  });

  while (true) {
    if (records.length >= request.maxRecords) return finish("max_records");
    if (now() >= request.deadline) return finish("time_limit");
    if (requests > 0) await sleep(PAUSE_BETWEEN_REQUESTS_MS);

    let payload: unknown = null;
    for (let attempt = 0; ; attempt += 1) {
      requests += 1;
      let response: Response;
      try {
        response = await fetchPage(buildHistoryUrl(request, offset), {
          headers: { Accept: "application/json" },
          cache: "no-store",
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "request failed";
        if (attempt < RATE_LIMIT_WAITS_MS.length && now() < request.deadline) {
          await sleep(RATE_LIMIT_WAITS_MS[attempt]);
          continue;
        }
        return finish("source_error", `OGD India could not be reached: ${message}`);
      }

      if (response.status === 429) {
        const wait = RATE_LIMIT_WAITS_MS[attempt];
        if (wait === undefined || now() + wait >= request.deadline) {
          return finish("rate_limited", "data.gov.in rate limit (HTTP 429). Try again later.");
        }
        await sleep(wait);
        continue;
      }
      if (!response.ok) {
        return finish("source_error", `OGD India returned HTTP ${response.status}.`);
      }
      payload = await response.json().catch(() => null);
      break;
    }

    const page =
      payload &&
      typeof payload === "object" &&
      Array.isArray((payload as { records?: unknown }).records)
        ? (payload as { records: unknown[] }).records
        : null;
    if (!page) return finish("source_error", "OGD India returned an unexpected response.");

    const reportedLimit = Number((payload as { limit?: unknown }).limit);
    if (pageSize === null) {
      pageSize =
        Number.isSafeInteger(reportedLimit) && reportedLimit > 0 ? reportedLimit : page.length;
    }
    if (page.length === 0) return finish("no_more_records");

    let crossedStart = false;
    for (const raw of page) {
      const record = lowerCaseHistoryRecord(raw);
      if (!record) continue;
      const date = historyDateToIso(record.arrival_date);
      if (date && date < request.fromDate) {
        crossedStart = true;
        continue;
      }
      if (records.length >= request.maxRecords) break;
      records.push(record);
      if (date) {
        if (!newestDate || date > newestDate) newestDate = date;
        if (!oldestDate || date < oldestDate) oldestDate = date;
      }
    }

    if (crossedStart) return finish("reached_start_date");
    if (page.length < (pageSize ?? page.length)) return finish("no_more_records");
    offset += page.length;
  }
}
