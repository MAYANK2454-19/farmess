import type { MarketSearchFilters } from "./types";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;
const MAX_OFFSET = 100_000;
const MAX_FILTER_LENGTH = 100;

function optionalFilter(value: string | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, MAX_FILTER_LENGTH) : undefined;
}

function parseLimit(value: string | null): number {
  const trimmed = value?.trim();
  if (!trimmed || !/^\d+$/.test(trimmed)) return DEFAULT_LIMIT;

  const parsed = Number(trimmed);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.min(parsed, MAX_LIMIT);
}

function parseOffset(value: string | null): number {
  const trimmed = value?.trim();
  if (!trimmed || !/^\d+$/.test(trimmed)) return 0;

  const parsed = Number(trimmed);
  if (!Number.isSafeInteger(parsed) || parsed < 0) return 0;
  return Math.min(parsed, MAX_OFFSET);
}

export function parseMarketSearchFilters(params: URLSearchParams): MarketSearchFilters {
  const commodity = optionalFilter(params.get("commodity"));
  const state = optionalFilter(params.get("state"));
  const district = optionalFilter(params.get("district"));
  const market = optionalFilter(params.get("market"));

  return {
    ...(commodity ? { commodity } : {}),
    ...(state ? { state } : {}),
    ...(district ? { district } : {}),
    ...(market ? { market } : {}),
    limit: parseLimit(params.get("limit")),
    ...(params.has("offset") ? { offset: parseOffset(params.get("offset")) } : {}),
  };
}
