"use client";

import type { MarketPriceRecord } from "@/lib/market-data/types";
import { summarizeMarketPriceRecords } from "@/lib/market-data/summary";
import styles from "./market-summary-panel.module.css";

type Props = { records: MarketPriceRecord[] };

function formatPrice(value: number | null): string {
  if (value === null) return "—";
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 2,
  }).format(value);
}

export function MarketSummaryPanel({ records }: Props) {
  const summary = summarizeMarketPriceRecords(records);
  const metrics = [
    { label: "Observations shown", value: summary.observationCount.toLocaleString("en-IN") },
    { label: "Reported modal prices", value: summary.reportedPriceCount.toLocaleString("en-IN") },
    { label: "Markets represented", value: summary.marketCount.toLocaleString("en-IN") },
    { label: "Average modal price", value: `₹${formatPrice(summary.averageModalPrice)}` },
    { label: "Lowest modal price", value: `₹${formatPrice(summary.lowestModalPrice)}` },
    { label: "Highest modal price", value: `₹${formatPrice(summary.highestModalPrice)}` },
  ];

  return (
    <section className={`panel ${styles.panel}`} aria-labelledby="market-summary-heading">
      <div className={styles.heading}>
        <div>
          <h2 id="market-summary-heading">Market snapshot</h2>
          <p>Summary of the currently visible observations. Prices are reported values, not live quotes.</p>
        </div>
        <span className={styles.unit}>₹ per quintal</span>
      </div>
      <dl className={styles.metrics}>
        {metrics.map((metric) => (
          <div className={styles.metric} key={metric.label}>
            <dt>{metric.label}</dt>
            <dd>{metric.value}</dd>
          </div>
        ))}
      </dl>
      {summary.reportedPriceCount === 0 && (
        <p className={styles.note} role="note">
          No valid reported modal prices are available in this filtered result set.
        </p>
      )}
    </section>
  );
}
