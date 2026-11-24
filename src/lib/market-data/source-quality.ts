import type { MarketSourceQuality, MarketSourceQualityRejectionReason } from "./types.ts";

export type MarketSourceQualityReason = {
  reason: MarketSourceQualityRejectionReason;
  label: string;
  count: number;
};

const REASON_LABELS: Record<MarketSourceQualityRejectionReason, string> = {
  invalid_record: "Unreadable source row",
  missing_identity: "Missing market details",
  invalid_observation_date: "Invalid observation date",
  invalid_price: "Invalid price value",
  missing_prices: "No price values reported",
  inconsistent_prices: "Price values do not agree",
};

export function getMarketSourceQualityReasons(
  quality: MarketSourceQuality,
): MarketSourceQualityReason[] {
  return (Object.keys(REASON_LABELS) as MarketSourceQualityRejectionReason[])
    .map((reason) => ({
      reason,
      label: REASON_LABELS[reason],
      count: quality.rejectionReasons[reason],
    }))
    .filter((item) => Number.isSafeInteger(item.count) && item.count > 0);
}
