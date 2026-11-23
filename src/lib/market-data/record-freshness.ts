import { assessMarketDataFreshness } from "./freshness.ts";

export type MarketRecordFreshnessLabel = {
  status: "fresh" | "stale" | "future" | "invalid";
  label: string;
  explanation: string;
};

export function getMarketRecordFreshnessLabel(
  observationDate: string,
  now = new Date(),
): MarketRecordFreshnessLabel {
  const result = assessMarketDataFreshness(observationDate, now);

  switch (result.status) {
    case "fresh":
      return {
        status: "fresh",
        label: "Within 48 hours",
        explanation: "This observation is within the configured 48-hour freshness window.",
      };
    case "stale":
      return {
        status: "stale",
        label: "Older than 48 hours",
        explanation: "This observation is older than the configured 48-hour freshness window.",
      };
    case "future":
      return {
        status: "future",
        label: "Future-dated",
        explanation: "This observation is dated in the future and should not be treated as current.",
      };
    case "invalid":
      return {
        status: "invalid",
        label: "Date unavailable",
        explanation: "The observation date could not be validated.",
      };
  }
}
