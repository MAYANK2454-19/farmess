import type { MarketPriceRecord } from "./types.ts";

export const OGD_RESOURCE_ID = "9ef84268-d588-465a-a308-a864a43d0070";
export const OGD_RESOURCE_URL =
  "https://data.gov.in/resource/current-daily-price-various-commodities-various-markets-mandi";
export const OGD_API_URL = `https://api.data.gov.in/resource/${OGD_RESOURCE_ID}`;
export const SOURCE_NAME = "OGD India / AGMARKNET";
export const SOURCE_PRICE_UNIT = "INR/quintal";

type RawRecord = Record<string, unknown>;

function requiredText(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}

function parsePrice(value: unknown): string | null | undefined {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const normalized = String(value).trim().replace(/,/g, "");
  if (!/^(?:\d+\.?\d*|\.\d+)$/.test(normalized)) return undefined;
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount < 0) return undefined;
  return amount.toFixed(2);
}

function parseObservationDate(value: unknown): string | null {
  const raw = requiredText(value);
  if (!raw) return null;
  const dmy = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw);
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  const candidate = dmy
    ? [dmy[3], dmy[2], dmy[1]].join("-")
    : iso
      ? raw
      : null;
  if (!candidate) return null;
  const date = new Date(`${candidate}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== candidate
    ? null
    : candidate;
}

export function normalizeOgdRecord(raw: RawRecord, retrievedAt: string): MarketPriceRecord | null {
  const commodity = requiredText(raw.commodity);
  const state = requiredText(raw.state);
  const district = requiredText(raw.district);
  const market = requiredText(raw.market);
  const observationDate = parseObservationDate(raw.arrival_date ?? raw.date);
  const minPrice = parsePrice(raw.min_price);
  const maxPrice = parsePrice(raw.max_price);
  const modalPrice = parsePrice(raw.modal_price);

  if (!commodity || !state || !district || !market || !observationDate) return null;
  if (minPrice === undefined || maxPrice === undefined || modalPrice === undefined) return null;
  if (minPrice === null && maxPrice === null && modalPrice === null) return null;

  const min = minPrice === null ? null : Number(minPrice);
  const max = maxPrice === null ? null : Number(maxPrice);
  const modal = modalPrice === null ? null : Number(modalPrice);
  if (
    (min !== null && max !== null && min > max) ||
    (modal !== null && min !== null && modal < min) ||
    (modal !== null && max !== null && modal > max)
  ) {
    return null;
  }

  const variety = requiredText(raw.variety);
  const grade = requiredText(raw.grade);
  const idParts = [
    state,
    district,
    market,
    commodity,
    variety ?? "",
    grade ?? "",
    observationDate,
  ];
  return {
    id: idParts.join("|").toLowerCase(),
    commodity,
    variety,
    state,
    district,
    market,
    minPrice,
    maxPrice,
    modalPrice,
    currency: "INR",
    priceUnit: "INR/quintal",
    sourcePriceUnit: SOURCE_PRICE_UNIT,
    observationDate,
    retrievedAt,
    sourceName: SOURCE_NAME,
    sourceUrl: OGD_RESOURCE_URL,
    valueType: "reported",
  };
}

export function normalizeOgdResponse(payload: unknown, retrievedAt: string): MarketPriceRecord[] {
  if (
    !payload ||
    typeof payload !== "object" ||
    !Array.isArray((payload as { records?: unknown }).records)
  ) {
    throw new Error("OGD response schema mismatch: expected a records array.");
  }
  return (payload as { records: RawRecord[] }).records
    .map((record) => normalizeOgdRecord(record, retrievedAt))
    .filter((record): record is MarketPriceRecord => record !== null);
}

export function isObservationStale(observationDate: string, now = new Date()): boolean {
  const observed = new Date(`${observationDate}T00:00:00.000Z`);
  const ageMs = now.getTime() - observed.getTime();
  return ageMs > 48 * 60 * 60 * 1000;
}
