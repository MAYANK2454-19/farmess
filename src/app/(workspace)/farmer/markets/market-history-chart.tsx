"use client";

import { useMemo, useState } from "react";

import { buildMarketHistorySeries } from "@/lib/market-data/history-series";
import type { MarketPriceRecord } from "@/lib/market-data/types";
import styles from "./market-history-chart.module.css";

type Props = { records: MarketPriceRecord[] };

function formatPrice(value: string | null): string {
  if (value === null) return "Not reported";
  const amount = Number(value);
  return Number.isFinite(amount)
    ? new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(amount)
    : "Not reported";
}

function formatDate(value: string): string {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).format(date);
}

export function MarketHistoryChart({ records }: Props) {
  const history = useMemo(() => buildMarketHistorySeries(records), [records]);
  const reportedSeries = useMemo(
    () => history.series.filter((series) => series.valueType === "reported"),
    [history],
  );
  const [selectedId, setSelectedId] = useState("");
  const selected = reportedSeries.find((series) => series.id === selectedId) ?? reportedSeries[0];

  const chart = useMemo(() => {
    if (!selected) return null;

    const prices = selected.points
      .map((point) => (point.modalPrice === null ? null : Number(point.modalPrice)))
      .filter((price): price is number => price !== null && Number.isFinite(price));

    if (prices.length < 2) {
      return { points: [], paths: [], min: 0, max: 0 };
    }

    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const range = max - min || 1;
    const firstTimestamp = Date.parse(`${selected.points[0].observationDate}T00:00:00.000Z`);
    const lastTimestamp = Date.parse(
      `${selected.points[selected.points.length - 1].observationDate}T00:00:00.000Z`,
    );
    const timeRange = lastTimestamp - firstTimestamp;
    const points = selected.points.map((point) => {
      const price = point.modalPrice === null ? null : Number(point.modalPrice);

      return {
        id: point.id,
        date: point.observationDate,
        price: price !== null && Number.isFinite(price) ? price : null,
        x:
          timeRange <= 0
            ? 408
            : 56 +
              ((Date.parse(`${point.observationDate}T00:00:00.000Z`) - firstTimestamp) /
                timeRange) *
                704,
        y:
          price === null || !Number.isFinite(price)
            ? null
            : 22 + ((max - price) / range) * 170,
      };
    });

    const paths: string[] = [];
    let segment = "";

    for (const point of points) {
      if (point.y === null) {
        if (segment) paths.push(segment);
        segment = "";
        continue;
      }

      segment += `${segment ? " L" : "M"} ${point.x} ${point.y}`;
    }

    if (segment) paths.push(segment);

    return { points, paths, min, max };
  }, [selected]);

  if (reportedSeries.length === 0) {
    return (
      <section className={`panel ${styles.panel}`} aria-labelledby="history-heading">
        <div className={styles.heading}>
          <div>
            <h2 id="history-heading">Price history</h2>
            <p>Historical modal-price observations from the selected market data source.</p>
          </div>
        </div>
        <div className={styles.emptyState} role="status">
          <strong>No reported history available</strong>
          <p>
            The current result set contains no valid reported observations for a history series.
            Demo values are kept separate and are not shown as market history.
          </p>
        </div>
      </section>
    );
  }

  const hasTrend = Boolean(
    selected?.status === "available" &&
      chart &&
      chart.points.filter((point) => point.price !== null).length >= 2,
  );

  return (
    <section className={`panel ${styles.panel}`} aria-labelledby="history-heading">
      <div className={styles.heading}>
        <div>
          <h2 id="history-heading">Price history</h2>
          <p>Compare dated modal-price observations. Missing dates are not filled or estimated.</p>
        </div>
        <label className={styles.seriesPicker}>
          <span>Market series</span>
          <select
            className="form-control"
            value={selected?.id ?? ""}
            onChange={(event) => setSelectedId(event.target.value)}
          >
            {reportedSeries.map((series) => (
              <option key={series.id} value={series.id}>
                {series.commodity} · {series.market} ·{" "}
                {series.variety ?? "Unspecified variety"}
              </option>
            ))}
          </select>
        </label>
      </div>

      {selected && (
        <>
          <div className={styles.context}>
            <strong>{selected.commodity}</strong>
            <span>
              {[selected.variety, selected.market, selected.district, selected.state]
                .filter(Boolean)
                .join(" · ")}
            </span>
            <span>{selected.priceUnit}</span>
            <span>{selected.observationCount} observations</span>
          </div>

          {!hasTrend ? (
            <div className={styles.emptyState} role="status">
              <strong>
                {selected.status === "single_observation"
                  ? "One observation — not enough to show a trend"
                  : "Not enough reported modal prices to draw a trend"}
              </strong>
              <p>
                More dated observations with a reported modal price are needed. No trend line or
                forecast is inferred from missing values.
              </p>
            </div>
          ) : (
            <div className={styles.chartWrap}>
              <svg
                className={styles.chart}
                viewBox="0 0 800 250"
                role="img"
                aria-label={`Reported modal price history for ${selected.commodity} at ${selected.market}, in ${selected.priceUnit}`}
              >
                {[0, 1, 2, 3].map((step) => {
                  const value = chart!.max - ((chart!.max - chart!.min) * step) / 3;
                  const y = 22 + (170 * step) / 3;

                  return (
                    <g key={step}>
                      <line
                        x1="56"
                        x2="760"
                        y1={y}
                        y2={y}
                        className={styles.gridLine}
                      />
                      <text
                        x="48"
                        y={y + 4}
                        textAnchor="end"
                        className={styles.axisLabel}
                      >
                        ₹{formatPrice(value.toFixed(2))}
                      </text>
                    </g>
                  );
                })}
                {chart!.paths.map((path, index) => (
                  <path key={index} d={path} className={styles.trendLine} />
                ))}
                {chart!.points.map((point) =>
                  point.y === null ? null : (
                    <circle
                      key={point.id}
                      cx={point.x}
                      cy={point.y}
                      r="5"
                      className={styles.point}
                    >
                      <title>
                        {formatDate(point.date)}: ₹{formatPrice(point.price!.toFixed(2))}
                      </title>
                    </circle>
                  ),
                )}
                {chart!.points.length > 0 && (
                  <>
                    <text x="56" y="228" className={styles.axisLabel}>
                      {formatDate(chart!.points[0].date)}
                    </text>
                    <text
                      x="760"
                      y="228"
                      textAnchor="end"
                      className={styles.axisLabel}
                    >
                      {formatDate(chart!.points[chart!.points.length - 1].date)}
                    </text>
                  </>
                )}
              </svg>
              <div className={styles.legend}>
                <span className={styles.legendDot} aria-hidden="true" />
                <span>Reported modal price</span>
                <span className={styles.chartNote}>No prediction · no interpolation</span>
              </div>
            </div>
          )}

          {selected.gaps.length > 0 && (
            <div className={styles.gapNotice} role="note">
              <strong>Missing observation dates:</strong>{" "}
              {selected.gaps
                .map(
                  (gap) =>
                    `${formatDate(gap.fromDate)} – ${formatDate(gap.toDate)} (${gap.missingDays} days)`,
                )
                .join("; ")}
            </div>
          )}

          <div className={styles.tableWrap}>
            <table className={styles.historyTable}>
              <caption>Source observations used in this series</caption>
              <thead>
                <tr>
                  <th scope="col">Observation date</th>
                  <th scope="col">Min price</th>
                  <th scope="col">Modal price</th>
                  <th scope="col">Max price</th>
                  <th scope="col">Source</th>
                </tr>
              </thead>
              <tbody>
                {selected.points.map((point) => (
                  <tr key={point.id}>
                    <td>{formatDate(point.observationDate)}</td>
                    <td>₹{formatPrice(point.minPrice)}</td>
                    <td>₹{formatPrice(point.modalPrice)}</td>
                    <td>₹{formatPrice(point.maxPrice)}</td>
                    <td>
                      <a href={point.sourceUrl} target="_blank" rel="noreferrer">
                        {point.sourceName}
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className={styles.disclaimer}>
            Source: {selected.sourceName}. Values are historical reported observations, not live
            quotes, guaranteed selling prices or a forecast.
          </p>
        </>
      )}
    </section>
  );
}
