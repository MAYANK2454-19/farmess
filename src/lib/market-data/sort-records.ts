import type { MarketPriceRecord } from "./types.ts";

export type MarketRecordSortOrder = "newest" | "oldest" | "modal-high" | "modal-low";

function compareNullablePrices(
  left: string | null,
  right: string | null,
  direction: "asc" | "desc",
): number {
  const leftValue = left === null ? Number.NaN : Number(left);
  const rightValue = right === null ? Number.NaN : Number(right);
  const leftValid = Number.isFinite(leftValue);
  const rightValid = Number.isFinite(rightValue);

  if (!leftValid && !rightValid) return 0;
  if (!leftValid) return 1;
  if (!rightValid) return -1;

  return direction === "asc" ? leftValue - rightValue : rightValue - leftValue;
}

export function sortMarketPriceRecords(
  records: readonly MarketPriceRecord[],
  order: MarketRecordSortOrder,
): MarketPriceRecord[] {
  return records
    .map((record, index) => ({ record, index }))
    .sort((left, right) => {
      let comparison = 0;

      switch (order) {
        case "newest":
          comparison = right.record.observationDate.localeCompare(left.record.observationDate);
          break;
        case "oldest":
          comparison = left.record.observationDate.localeCompare(right.record.observationDate);
          break;
        case "modal-high":
          comparison = compareNullablePrices(
            left.record.modalPrice,
            right.record.modalPrice,
            "desc",
          );
          break;
        case "modal-low":
          comparison = compareNullablePrices(
            left.record.modalPrice,
            right.record.modalPrice,
            "asc",
          );
          break;
      }

      return comparison || left.index - right.index;
    })
    .map(({ record }) => record);
}
