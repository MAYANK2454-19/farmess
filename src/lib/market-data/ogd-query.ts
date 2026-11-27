import { OGD_API_URL } from "./normalize.ts";

/*
 * Queries to OGD India's "current daily price" resource (today's reports).
 *
 * That resource matches a filter by single words: asking for the state
 * "Uttar Pradesh" also finds Madhya Pradesh and Andhra Pradesh, and
 * "Bitter gourd" finds every other gourd (checked against data.gov.in on
 * 27 Nov 2026: 2,269 rows instead of 330, and 712 instead of 320). Only the
 * ".keyword" form of a field is an exact match. So a name Farmess knows
 * exactly (a state, a listed commodity, a district's name at the source) is
 * asked for in the exact form, and free text (an unlisted crop, part of a
 * mandi's name) keeps the word match.
 *
 * The price history resource is different: its filters are always exact.
 */

/** A name to filter by: exact when Farmess knows the source's spelling, else matched by words. */
export type NameFilter = { name: string; exact: boolean };

export type CurrentPricesQuery = {
  commodity?: NameFilter | null;
  state?: NameFilter | null;
  district?: NameFilter | null;
  /** Typed by people, often only part of a mandi's name: always matched by words. */
  market?: string | null;
  offset?: number;
};

export function currentPricesUrl(apiKey: string, query: CurrentPricesQuery): URL {
  const url = new URL(OGD_API_URL);
  url.searchParams.set("api-key", apiKey);
  url.searchParams.set("format", "json");
  url.searchParams.set("offset", String(query.offset ?? 0));
  for (const field of ["commodity", "state", "district"] as const) {
    const filter = query[field];
    if (!filter?.name) continue;
    url.searchParams.set(`filters[${field}${filter.exact ? ".keyword" : ""}]`, filter.name);
  }
  if (query.market) url.searchParams.set("filters[market]", query.market);
  return url;
}
