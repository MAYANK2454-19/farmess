/*
 * In-memory cache for OGD India (data.gov.in) search results.
 *
 * data.gov.in rate-limits each API key, and mandi reports are published daily,
 * so repeating an identical search within minutes adds no information. Fluid
 * Compute reuses server instances, so this cache is shared by many requests.
 *
 * - Successful results are kept for SUCCESS_TTL_MS. The original retrievedAt
 *   is preserved, so the UI always shows when the source was actually read.
 * - A rate-limit (HTTP 429) result is kept for RATE_LIMIT_TTL_MS as a cooldown,
 *   so a burst of page loads does not keep hitting the provider.
 * - Other failures are not cached.
 */

export const SUCCESS_TTL_MS = 15 * 60 * 1000;
export const RATE_LIMIT_TTL_MS = 60 * 1000;
export const MAX_ENTRIES = 200;

type Entry<T> = { value: T; expiresAt: number };

export class TtlCache<T> {
  private readonly entries = new Map<string, Entry<T>>();
  private readonly maxEntries: number;
  private readonly now: () => number;

  constructor(maxEntries = MAX_ENTRIES, now: () => number = Date.now) {
    this.maxEntries = maxEntries;
    this.now = now;
  }

  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: T, ttlMs: number): void {
    if (this.entries.has(key)) this.entries.delete(key);
    this.entries.set(key, { value, expiresAt: this.now() + ttlMs });
    // Evict the oldest insertion when full (Map keeps insertion order).
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }

  get size(): number {
    return this.entries.size;
  }
}

/** Stable cache key: the same filters in any order map to the same key. */
export function cacheKeyForFilters(filters: object): string {
  const entries = Object.entries(filters)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => [key, typeof value === "string" ? value.trim().toLowerCase() : value])
    .sort(([a], [b]) => String(a).localeCompare(String(b)));
  return JSON.stringify(entries);
}

export function isRateLimitMessage(message: string | undefined): boolean {
  return typeof message === "string" && /HTTP 429/.test(message);
}
