"use client";

import { useMemo } from "react";

import { buildMarketPriceComparisons } from "@/lib/market-data/market-comparison";
import { marketPriceComparisonsToCsv } from "@/lib/market-data/market-comparison-csv";
import type { MarketPriceRecord } from "@/lib/market-data/types";
import styles from "./market-comparison-panel.module.css";

type Props = { records: MarketPriceRecord[] };

function formatPrice(value: number): string {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(value);
}

function formatDate(value: string): string {
  const date = new Date(value + "T00:00:00");
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).format(date);
}

export function MarketComparisonPanel({ records }: Props) {
  const comparisons = useMemo(() => buildMarketPriceComparisons(records), [records]);

  function handleExport() {
    if (comparisons.length === 0) return;

    const csv = marketPriceComparisonsToCsv(comparisons);
    const objectUrl = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = "farmess-mandi-comparison-" + new Date().toISOString().slice(0, 10) + ".csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  }

  return (
    <section className={"panel " + styles.panel} aria-labelledby="market-comparison-heading">
      <div className={styles.heading}>
        <div>
          <h2 id="market-comparison-heading">Compare mandi prices</h2>
          <p>
            Same commodity, variety and observation date only. Repeated records for a mandi are
            averaged before comparison.
          </p>
        </div>
        <div className={styles.headingActions}>
          <span className={styles.unit}>₹ per quintal</span>
          {comparisons.length > 0 && (
            <button className="button button-secondary" type="button" onClick={handleExport}>
              Export comparison CSV
            </button>
          )}
        </div>
      </div>

      {comparisons.length === 0 ? (
        <p className={styles.empty} role="status">
          No same-day comparison across two or more mandis is available in the current filtered
          records.
        </p>
      ) : (
        <div className={styles.groups}>
          {comparisons.map((comparison) => (
            <section className={styles.comparison} key={comparison.id}>
              <div className={styles.comparisonHeading}>
                <div>
                  <h3>{comparison.commodity}</h3>
                  <p>
                    {comparison.variety ? comparison.variety + " · " : ""}
                    {formatDate(comparison.observationDate)}
                  </p>
                </div>
                <div className={styles.spread}>
                  <span>Price spread</span>
                  <strong>₹{formatPrice(comparison.priceSpread)}</strong>
                  {comparison.spreadPercent !== null && (
                    <small>{formatPrice(comparison.spreadPercent)}% from lowest</small>
                  )}
                </div>
              </div>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <caption>
                    Reported modal-price comparison for {comparison.commodity} on{" "}
                    {formatDate(comparison.observationDate)}
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Mandi</th>
                      <th scope="col">District / state</th>
                      <th scope="col">Avg. modal price</th>
                      <th scope="col">Records</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparison.markets.map((market, index) => (
                      <tr key={market.market + "|" + market.district + "|" + market.state}>
                        <td>
                          <span className={styles.marketName}>
                            {market.market || "Unnamed market"}
                          </span>
                          {index === 0 && <span className={styles.lowest}>Lowest reported</span>}
                        </td>
                        <td>
                          {[market.district, market.state].filter(Boolean).join(", ") || "—"}
                        </td>
                        <td className={styles.price}>₹{formatPrice(market.averageModalPrice)}</td>
                        <td>{market.observationCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}
      <p className={styles.disclaimer}>
        Comparisons use reported modal prices from the same observation date. They are not live
        quotes, transport-adjusted net returns or a guarantee of the price a farmer will receive.
      </p>
    </section>
  );
}
