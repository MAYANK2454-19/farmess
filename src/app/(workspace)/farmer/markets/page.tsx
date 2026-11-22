import { FeaturePlaceholder } from "@/components/feature-placeholder";
export default function MarketsPage() {
  return (
    <FeaturePlaceholder
      title="Market Prices"
      subtitle="Reported market observations with source, date, unit and freshness."
      owner="Yash"
      scope="The market-data lane will validate the selected source, preserve observation and retrieval timestamps, and show an honest no-data or stale state when records are unavailable."
    />
  );
}
