"use client";

import { useEffect, useState } from "react";
import type {
  ForecastPoint,
  PriceForecastResult,
  PricePoint,
} from "@/lib/market-data/price-forecast";
import type { MlForecastResult } from "@/lib/market-data/ml-forecast";
import styles from "./market-forecast-panel.module.css";

type ForecastResponse = {
  status: string;
  crop?: string;
  market?: string | null;
  district?: string | null;
  state?: string | null;
  markets?: { name: string; reports: number }[];
  minimumReports?: number;
  message?: string;
  result?: PriceForecastResult;
  ml?: MlForecastResult | { status: "unavailable" };
  error?: string;
};

const rupees = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);

function shortDate(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" }).format(
        date,
      );
}

type ChartForecast = { points: ForecastPoint[]; color: string };

const STATS_COLOR = "var(--haldi-deep)";
const ML_COLOR = "var(--mitti)";

function TrendChart({
  history,
  forecasts,
  band: bandPoints,
}: {
  history: PricePoint[];
  forecasts: ChartForecast[];
  band: ForecastPoint[];
}) {
  const forecast = forecasts.flatMap((item) => item.points);
  const width = 720;
  const height = 240;
  const pad = { left: 56, right: 16, top: 14, bottom: 28 };
  const all = [
    ...history.map((p) => ({ date: p.date, low: p.price, high: p.price })),
    ...forecast.map((p) => ({ date: p.date, low: p.low, high: p.high })),
  ];
  const day = (date: string) => new Date(`${date}T00:00:00.000Z`).getTime() / 86_400_000;
  const minX = day(all[0].date);
  const maxX = Math.max(day(all[all.length - 1].date), minX + 1);
  const minY = Math.min(...all.map((p) => p.low)) * 0.95;
  const maxY = Math.max(...all.map((p) => p.high)) * 1.05;
  const x = (date: string) =>
    pad.left + ((day(date) - minX) / (maxX - minX)) * (width - pad.left - pad.right);
  const y = (value: number) =>
    pad.top + (1 - (value - minY) / Math.max(1, maxY - minY)) * (height - pad.top - pad.bottom);
  const line = (points: { date: string; price: number }[]) =>
    points
      .map((p, i) => `${i ? "L" : "M"}${x(p.date).toFixed(1)},${y(p.price).toFixed(1)}`)
      .join(" ");
  const last = history[history.length - 1];
  const ticks = [0, 0.5, 1].map((t) => minY + t * (maxY - minY));
  const band = bandPoints.length
    ? `M${x(last.date)},${y(last.price)} ` +
      bandPoints.map((p) => `L${x(p.date)},${y(p.high)}`).join(" ") +
      " " +
      [...bandPoints]
        .reverse()
        .map((p) => `L${x(p.date)},${y(p.low)}`)
        .join(" ") +
      " Z"
    : "";

  return (
    <svg
      className={styles.chart}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Modal price history${forecast.length ? " and 7-report forecast" : ""}`}
    >
      {ticks.map((value) => (
        <g key={value}>
          <line
            x1={pad.left}
            x2={width - pad.right}
            y1={y(value)}
            y2={y(value)}
            stroke="var(--line)"
          />
          <text
            x={pad.left - 8}
            y={y(value) + 4}
            textAnchor="end"
            fontSize="11"
            fill="var(--muted)"
          >
            {rupees(value)}
          </text>
        </g>
      ))}
      <text x={pad.left} y={height - 8} fontSize="11" fill="var(--muted)">
        {shortDate(history[0].date)}
      </text>
      <text x={x(last.date)} y={height - 8} fontSize="11" fill="var(--muted)" textAnchor="middle">
        {shortDate(last.date)}
      </text>
      {band ? <path d={band} fill="var(--haldi-soft)" stroke="none" /> : null}
      <path d={line(history)} fill="none" stroke="var(--khet-mid)" strokeWidth="2" />
      {forecasts.map((item) => (
        <path
          key={item.color}
          d={line([last, ...item.points])}
          fill="none"
          stroke={item.color}
          strokeWidth="2.5"
          strokeDasharray="6 4"
        />
      ))}
      <circle cx={x(last.date)} cy={y(last.price)} r="4" fill="var(--khet)" />
    </svg>
  );
}

export function MarketForecastPanel({
  crop,
  market,
  state,
  district,
}: {
  crop: string;
  market: string;
  state?: string;
  district?: string;
}) {
  const [picked, setPicked] = useState("");
  const query = new URLSearchParams();
  if (crop.trim()) query.set("crop", crop.trim());
  const chosen = picked || market.trim();
  if (chosen) query.set("market", chosen);
  if (state?.trim()) query.set("state", state.trim());
  if (district?.trim()) query.set("district", district.trim());
  const key = query.toString();

  const [response, setResponse] = useState<{
    key: string;
    data?: ForecastResponse;
    error?: string;
  } | null>(null);

  useEffect(() => {
    let active = true;
    fetch(`/api/market-forecasts?${key}`, { cache: "no-store" })
      .then(async (res) => {
        const data = (await res.json()) as ForecastResponse;
        if (!res.ok) throw new Error(data.error ?? "Price trend could not be loaded.");
        if (active) setResponse({ key, data });
      })
      .catch((error: unknown) => {
        if (active) {
          setResponse({
            key,
            error: error instanceof Error ? error.message : "Price trend could not be loaded.",
          });
        }
      });
    return () => {
      active = false;
    };
  }, [key]);

  const current = response?.key === key ? response : null;
  const data = current?.data;
  const result = data?.result;
  const ml = data?.ml && data.ml.status !== "unavailable" ? data.ml : null;

  const statsPassed = result?.status === "forecast" ? result : null;
  const mlPassed = ml?.status === "forecast" ? ml : null;
  const candidates = [
    statsPassed && {
      label: "Statistical model",
      mae: statsPassed.backtest.modelMae,
      points: statsPassed.points,
    },
    mlPassed && {
      label: "Machine learning",
      mae: mlPassed.backtest.modelMae,
      points: mlPassed.points,
    },
  ].filter((item): item is { label: string; mae: number; points: ForecastPoint[] } =>
    Boolean(item),
  );
  const best = candidates.sort((a, b) => a.mae - b.mae)[0] ?? null;
  const bestLast = best ? best.points[best.points.length - 1] : null;
  const baselineMae =
    result && result.status !== "insufficient_history" && result.backtest
      ? result.backtest.baselineMae
      : null;

  return (
    <section className="panel" aria-labelledby="market-forecast-heading">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Price trend</p>
          <h2 className="panel-title" id="market-forecast-heading">
            {data?.crop && data.market
              ? `${data.crop} at ${data.market}`
              : "Price trend and forecast"}
          </h2>
          <p className="panel-caption">
            From real government (AGMARKNET) mandi reports saved in Farmess. A forecast is shown
            only if it was more accurate than “today’s price stays the same” on recent reports.
          </p>
        </div>
      </div>

      {data?.markets && data.markets.length > 1 ? (
        <div className={styles.markets} aria-label="Choose a mandi">
          {data.markets.map((item) => (
            <button
              type="button"
              key={item.name}
              className={styles.marketButton}
              aria-pressed={item.name === data.market}
              onClick={() => setPicked(item.name)}
            >
              {item.name} · {item.reports}
            </button>
          ))}
        </div>
      ) : null}

      {!current ? (
        <p className="empty-copy" role="status">
          Loading saved prices…
        </p>
      ) : current.error ? (
        <p className="empty-copy" role="alert">
          {current.error}
        </p>
      ) : data?.status === "choose_crop" ? (
        <div className={styles.message}>
          <strong>Choose a crop</strong>
          Search for a crop above to see how its mandi price has moved and where it may go next.
        </div>
      ) : data?.status === "no_saved_prices" ? (
        <div className={styles.message}>
          <strong>No saved prices for {data.crop} here yet</strong>
          {data.message}
        </div>
      ) : result?.status === "insufficient_history" ? (
        <div className={styles.message}>
          <strong>Not enough history yet</strong>
          Farmess has {result.reportCount} report day(s) for this mandi. A trend needs at least{" "}
          {result.minimumReports}. An admin can import past prices from data.gov.in.
        </div>
      ) : result ? (
        <>
          <div className={styles.summary}>
            <div className={styles.stat}>
              <span>Latest modal price ({shortDate(result.trend.latestDate)})</span>
              <strong>{rupees(result.trend.latestPrice)}/q</strong>
            </div>
            <div className={styles.stat}>
              <span>Change over ~30 days</span>
              <strong
                className={
                  result.trend.change30dPercent === null
                    ? undefined
                    : result.trend.change30dPercent >= 0
                      ? styles.up
                      : styles.down
                }
              >
                {result.trend.change30dPercent === null
                  ? "—"
                  : `${result.trend.change30dPercent > 0 ? "+" : ""}${result.trend.change30dPercent}%`}
              </strong>
            </div>
            {best && bestLast ? (
              <div className={styles.stat}>
                <span>
                  Expected by {shortDate(bestLast.date)} ({best.label.toLowerCase()})
                </span>
                <strong>{rupees(bestLast.price)}/q</strong>
              </div>
            ) : null}
            <div className={styles.stat}>
              <span>Report days used</span>
              <strong>{result.trend.reportCount}</strong>
            </div>
          </div>

          <TrendChart
            history={result.trend.history}
            forecasts={[
              ...(statsPassed ? [{ points: statsPassed.points, color: STATS_COLOR }] : []),
              ...(mlPassed ? [{ points: mlPassed.points, color: ML_COLOR }] : []),
            ]}
            band={best ? best.points : []}
          />
          <div className={styles.legend}>
            <span>
              <i className={styles.swatch} style={{ background: "var(--khet-mid)" }} />
              Reported modal price
            </span>
            {statsPassed ? (
              <span>
                <i className={styles.swatch} style={{ background: STATS_COLOR }} />
                Statistical forecast
              </span>
            ) : null}
            {mlPassed ? (
              <span>
                <i className={styles.swatch} style={{ background: ML_COLOR }} />
                ML forecast (gradient-boosted trees)
              </span>
            ) : null}
            {best ? (
              <span>
                <i
                  className={styles.swatch}
                  style={{ background: "var(--haldi-soft)", height: 10 }}
                />
                Likely range of the more accurate forecast
              </span>
            ) : null}
          </div>

          <div className="table-wrap">
            <table className="produce-table">
              <caption className={styles.caption}>
                Which forecast to trust: average error over the next 7 reports, tested on recent
                reports the models never saw
              </caption>
              <thead>
                <tr>
                  <th scope="col">Method</th>
                  <th scope="col">Average error</th>
                  <th scope="col">Shown?</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>&ldquo;Today&rsquo;s price stays the same&rdquo; (baseline)</td>
                  <td>{baselineMae === null ? "—" : rupees(baselineMae)}</td>
                  <td>Reference</td>
                </tr>
                <tr>
                  <td>Statistical model (smoothing / moving average)</td>
                  <td>{result.backtest ? rupees(result.backtest.modelMae) : "—"}</td>
                  <td>
                    {statsPassed
                      ? "Yes, beat the baseline"
                      : result.status === "trend_only" && result.reason === "stale"
                        ? "No, prices are out of date"
                        : "No, not better than the baseline"}
                  </td>
                </tr>
                <tr>
                  <td>
                    Machine learning (gradient-boosted trees
                    {ml && ml.status !== "insufficient_data"
                      ? `, ${ml.seriesUsed} mandi series`
                      : ""}
                    )
                  </td>
                  <td>
                    {ml && ml.status !== "insufficient_data" ? rupees(ml.backtest.modelMae) : "—"}
                  </td>
                  <td>
                    {!ml
                      ? result.status === "trend_only" && result.reason === "stale"
                        ? "No, prices are out of date"
                        : "Not available"
                      : ml.status === "insufficient_data"
                        ? `No, needs ${ml.minimumSamples} training examples (has ${ml.trainingSamples})`
                        : mlPassed
                          ? "Yes, beat the baseline"
                          : "No, not better than the baseline"}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <p className={styles.note}>
            {best && bestLast
              ? `Expected around ${rupees(bestLast.price)} per quintal by ${shortDate(bestLast.date)} (likely range ${rupees(bestLast.low)}–${rupees(bestLast.high)}), from the ${best.label.toLowerCase()}, which had the lowest error. This is an estimate, not a guaranteed price.`
              : result.status === "trend_only" && result.reason === "stale"
                ? `The latest saved report is from ${shortDate(result.trend.latestDate)}, so no forecast is shown. Import recent prices to refresh it.`
                : "No forecast is shown because neither model was more accurate than assuming today’s price holds. The trend above is still real reported data."}
          </p>
        </>
      ) : null}
    </section>
  );
}
