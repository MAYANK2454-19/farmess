import type { MarketPriceRecord } from "./types.ts";

export type MarketRecordFilters = {
  fromDate: string;
  toDate: string;
  minModalPrice: string;
  maxModalPrice: string;
};

export const EMPTY_MARKET_RECORD_FILTERS: MarketRecordFilters = {
  fromDate: "",
  toDate: "",
  minModalPrice: "",
  maxModalPrice: "",
};

function parseDateBound(value: string, label: string): string | null {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new RangeError(`${label} must be a valid date.`);
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new RangeError(`${label} must be a valid date.`);
  }
  return value;
}

function isValidObservationDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function parsePriceBound(value: string, label: string): number | null {
  if (!value.trim()) return null;
  const price = Number(value);
  if (!Number.isFinite(price) || price < 0) {
    throw new RangeError(`${label} must be a non-negative number.`);
  }
  return price;
}

export function filterMarketPriceRecords(
  records: readonly MarketPriceRecord[],
  filters: MarketRecordFilters,
): MarketPriceRecord[] {
  const fromDate = parseDateBound(filters.fromDate, "Start date");
  const toDate = parseDateBound(filters.toDate, "End date");
  const minPrice = parsePriceBound(filters.minModalPrice, "Minimum modal price");
  const maxPrice = parsePriceBound(filters.maxModalPrice, "Maximum modal price");

  if (fromDate && toDate && fromDate > toDate) {
    throw new RangeError("Start date must be on or before end date.");
  }
  if (minPrice !== null && maxPrice !== null && minPrice > maxPrice) {
    throw new RangeError("Minimum modal price must be on or below maximum modal price.");
  }

  return records.filter((record) => {
    if (fromDate || toDate) {
      if (!isValidObservationDate(record.observationDate)) return false;
      if (fromDate && record.observationDate < fromDate) return false;
      if (toDate && record.observationDate > toDate) return false;
    }

    if (minPrice !== null || maxPrice !== null) {
      if (record.modalPrice === null || record.modalPrice.trim() === "") return false;
      const modalPrice = Number(record.modalPrice);
      if (!Number.isFinite(modalPrice)) return false;
      if (minPrice !== null && modalPrice < minPrice) return false;
      if (maxPrice !== null && modalPrice > maxPrice) return false;
    }

    return true;
  });
}
