"use client";

import { useEffect, useRef, useState } from "react";
import type {
  ForecastPoint,
  PriceForecastResult,
  PricePoint,
} from "@/lib/market-data/price-forecast";
import type { MlForecastResult } from "@/lib/market-data/ml-forecast";
import type { WeatherForecastResult } from "@/lib/market-data/weather-forecast";
import { BACKGROUND_HEADER } from "@/lib/auth/session-policy";
import { fetchView, type FetchStatus, type FetchView } from "./fetch-progress";
import styles from "./market-forecast-panel.module.css";

type WeatherOutlook = {
  district: string;
  source: string;
  days: { date: string; rainMm: number | null; tmaxC: number | null; tminC: number | null }[];
  rainNext7Mm: number | null;
};

type ForecastResponse = {
  status: string;
  crop?: string;
  area?: {
    state: string | null;
    district: string | null;
    widened: boolean;
    sourceDistrict?: string | null;
  };
  market?: string | null;
  district?: string | null;
  state?: string | null;
  markets?: { name: string; reports: number; district?: string | null }[];
  minimumReports?: number;
  message?: string;
  result?: PriceForecastResult;
  ml?: MlForecastResult | { status: "unavailable" };
  weather?: WeatherForecastResult | { status: "unavailable"; reason: string };
  weatherOutlook?: WeatherOutlook | null;
  error?: string;
};

type AutomaticFetch = { status: FetchStatus; view: FetchView };

/** A check that failed (no connection, server busy) is tried again after this long. */
const FAILED_CHECK_MS = 8_000;
/** Forecasts are recomputed on reload, so new rows are picked up at most this often. */
const RELOAD_GAP_MS = 30_000;
const WEATHER_RETRY_MS = 40_000;
/** District weather takes about a minute to fetch; look at the forecast again after that. */
const WEATHER_RELOAD_MS = 75_000;
const WEATHER_RETRIES = 3;

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
const WEATHER_COLOR = "var(--megh)";

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
  const maxX = Math.max(...all.map((p) => day(p.date)), minX + 1);
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

/** Keeps asking the server to fetch missing prices and reports how that is going. */
function useAutomaticFetch(
  crop: string,
  state: string,
  district: string,
  onNewData: () => void,
): AutomaticFetch | null {
  const [value, setValue] = useState<({ key: string } & AutomaticFetch) | null>(null);
  const notify = useRef(onNewData);
  useEffect(() => {
    notify.current = onNewData;
  });
  const key = `${crop.trim()}|${state.trim()}|${district.trim()}`;

  useEffect(() => {
    if (!crop.trim() || !state.trim()) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const beganAt = Date.now();
    let lastStarted = 0;
    let lastVersion = "";
    let lastReload = 0;
    let reloadOwed = false;
    let calls = 0;
    let failures = 0;
    let weatherTimer: ReturnType<typeof setTimeout> | undefined;

    async function check() {
      if (!active) return;
      calls += 1;
      let status: FetchStatus | null = null;
      try {
        const response = await fetch("/api/market-history/ensure", {
          method: "POST",
          // Only the first check follows something the person did; the repeats
          // are automatic and must not keep an unattended session alive.
          headers: {
            "Content-Type": "application/json",
            ...(calls > 1 ? { [BACKGROUND_HEADER]: "1" } : {}),
          },
          body: JSON.stringify({
            crop: crop.trim(),
            state: state.trim(),
            district: district.trim() || undefined,
          }),
        });
        if (response.ok) status = (await response.json()) as FetchStatus;
      } catch {
        // A failed check is simply tried again below.
      }
      if (!active) return;
      if (!status) {
        failures += 1;
        if (failures < 3) timer = setTimeout(check, FAILED_CHECK_MS);
        return;
      }
      failures = 0;

      const now = Date.now();
      // Weather does not change the number of saved prices, so it gets its own reload.
      if (status.weatherStarted && !weatherTimer) {
        weatherTimer = setTimeout(() => {
          if (active) notify.current();
        }, WEATHER_RELOAD_MS);
      }
      if (status.started) lastStarted = now;
      const version = `${status.savedReports}:${status.newestDate ?? ""}`;
      if (lastVersion && version !== lastVersion) reloadOwed = true;
      lastVersion = version;

      const view = fetchView(status, {
        sinceBeganMs: now - beganAt,
        sinceStartedMs: lastStarted > 0 ? now - lastStarted : null,
      });
      setValue({ key, status, view });

      // New prices are shown at once when they are the first; later ones a little apart.
      const keepGoing = view.nextCheckMs !== null;
      if (reloadOwed && (!keepGoing || now - lastReload > RELOAD_GAP_MS)) {
        reloadOwed = false;
        lastReload = now;
        notify.current();
      }
      if (view.nextCheckMs !== null) timer = setTimeout(check, view.nextCheckMs);
      // The search itself saves today's reports a moment later: look once more.
      else if (calls === 1) timer = setTimeout(check, 6_000);
    }

    void check();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
      if (weatherTimer) clearTimeout(weatherTimer);
    };
  }, [key, crop, state, district]);

  return value && value.key === key ? value : null;
}

function FetchNotice({ fetch }: { fetch: AutomaticFetch | null }) {
  if (!fetch || fetch.view.lines.length === 0) return null;
  return (
    <p className={styles.fetchNotice} role="status">
      {fetch.view.busy ? <span className={styles.fetchDot} aria-hidden="true" /> : null}
      {/* One element per message: each is translated as a whole. */}
      <span className={styles.fetchLines}>
        {fetch.view.lines.map((line) => (
          <span key={line}>{line}</span>
        ))}
      </span>
    </p>
  );
}

function WeatherBlock({
  outlook,
  weather,
}: {
  outlook: WeatherOutlook | null | undefined;
  weather: WeatherForecastResult | null;
}) {
  if (!outlook || outlook.days.length === 0) return null;
  const passed = weather?.status === "forecast" ? weather : null;
  const scenarios = passed?.scenarios ?? null;
  const spread = scenarios ? Math.abs(scenarios.heavy - scenarios.dry) : 0;
  return (
    <div className={styles.weather} aria-labelledby="weather-outlook-heading">
      <h3 id="weather-outlook-heading">{`Weather outlook for ${outlook.district} district`}</h3>
      <p className={styles.weatherLead}>
        {outlook.rainNext7Mm === null
          ? "Rain forecast not available."
          : outlook.rainNext7Mm < 1
            ? "No rain expected in the next 7 days."
            : `${outlook.rainNext7Mm} mm of rain expected in the next 7 days.`}{" "}
        Source: Open-Meteo forecast for the district centre.
      </p>
      <ul className={styles.weatherDays}>
        {outlook.days.map((day) => (
          <li key={day.date}>
            <span>{shortDate(day.date)}</span>
            <strong>{day.rainMm === null ? "—" : `${Math.round(day.rainMm * 10) / 10} mm`}</strong>
            <span>
              {day.tmaxC === null ? "—" : `${Math.round(day.tmaxC)}°`}
              {day.tminC === null ? "" : ` / ${Math.round(day.tminC)}°`}
            </span>
          </li>
        ))}
      </ul>
      {scenarios ? (
        <>
          <p className={styles.weatherLead}>
            What the weather could do to the price by {shortDate(scenarios.date)}, according to the
            weather-aware model:
          </p>
          <div className={styles.scenarios}>
            <div>
              <span>If it stays dry</span>
              <strong>{rupees(scenarios.dry)}/q</strong>
            </div>
            <div>
              <span>
                With the forecast rain
                {scenarios.forecastRainMm === null ? "" : ` (${scenarios.forecastRainMm} mm)`}
              </span>
              <strong>{rupees(scenarios.asForecast)}/q</strong>
            </div>
            <div>
              <span>With heavy rain ({scenarios.heavyRainMm} mm or more)</span>
              <strong>{rupees(scenarios.heavy)}/q</strong>
            </div>
          </div>
          <p className={styles.note}>
            {spread < 1
              ? "The model found no clear effect of rain on this crop's price at this mandi."
              : `Rain moves this estimate by about ${rupees(spread)} per quintal.`}{" "}
            These are what-if estimates learned from past weeks with similar weather, not a
            guarantee.
          </p>
        </>
      ) : passed ? (
        <p className={styles.note}>
          Rain scenarios are not shown because the past year had no rainy spell long enough here to
          learn from.
        </p>
      ) : null}
    </div>
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
  const [reload, setReload] = useState(0);
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
  }, [key, reload]);

  const current = response?.key === key ? response : null;
  const data = current?.data;
  const result = data?.result;
  const ml = data?.ml && data.ml.status !== "unavailable" ? data.ml : null;
  const weather = data?.weather && data.weather.status !== "unavailable" ? data.weather : null;

  // Prices are fetched only for an area the person chose (or their profile's),
  // never for wherever the saved prices happen to come from.
  const fetchState = state?.trim() ?? "";
  const automatic = useAutomaticFetch(crop, fetchState, district?.trim() ?? "", () =>
    setReload((n) => n + 1),
  );

  // District weather is fetched in the background on first use; look again shortly.
  const weatherPending =
    data?.weather?.status === "insufficient_data" && data.weather.reason === "no_weather";
  const weatherRetries = useRef({ key: "", count: 0 });
  useEffect(() => {
    if (weatherRetries.current.key !== key) weatherRetries.current = { key, count: 0 };
    if (!weatherPending || weatherRetries.current.count >= WEATHER_RETRIES) return;
    const timer = setTimeout(() => {
      weatherRetries.current.count += 1;
      setReload((n) => n + 1);
    }, WEATHER_RETRY_MS);
    return () => clearTimeout(timer);
  }, [key, weatherPending, data]);

  const statsPassed = result?.status === "forecast" ? result : null;
  const mlPassed = ml?.status === "forecast" ? ml : null;
  const weatherPassed = weather?.status === "forecast" ? weather : null;
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
    weatherPassed && {
      label: "Machine learning with weather",
      mae: weatherPassed.backtest.modelMae,
      points: weatherPassed.points,
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
  const staleNote = result?.status === "trend_only" && result.reason === "stale";

  return (
    <section className={`panel ${styles.root}`} aria-labelledby="market-forecast-heading">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Price trend</p>
          <h2 className="panel-title" id="market-forecast-heading">
            {data?.crop && data.market
              ? `${data.crop} at ${data.market}`
              : "Price trend and forecast"}
          </h2>
          <p className="panel-caption">
            From real government (AGMARKNET) mandi reports, fetched automatically for the crop and
            area you choose. A forecast is shown only if it was more accurate than “today’s price
            stays the same” on recent reports.
          </p>
        </div>
      </div>

      <FetchNotice fetch={automatic} />

      {data?.area?.widened && data.area.district ? (
        <p className={styles.fetchNotice} role="note">
          No mandi in {data.area.district} district reports {data.crop}, so mandis elsewhere in{" "}
          {data.area.state} are shown.
        </p>
      ) : data?.area?.district && data.area.sourceDistrict ? (
        <p className={styles.fetchNotice} role="note">
          {`data.gov.in lists ${data.area.district} district as “${data.area.sourceDistrict}”; its mandis are shown here.`}
        </p>
      ) : null}

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
          {automatic?.view.phase === "fetching" || automatic?.view.phase === "waiting"
            ? "They are being fetched from data.gov.in now. This page updates by itself."
            : automatic?.view.phase === "retrying"
              ? "Farmess is still trying to fetch them from data.gov.in. This page updates by itself."
              : !fetchState
                ? "Choose your state and district above and Farmess fetches the prices from data.gov.in automatically."
                : automatic && !automatic.status.configured
                  ? "Automatic price fetching is not set up on this server yet."
                  : automatic?.view.phase === "none"
                    ? "data.gov.in has no recent reports for this crop here. Try a nearby district or the whole state."
                    : automatic
                      ? "Nothing could be fetched for this crop here just now. data.gov.in may have no recent reports for it, or may be limiting requests. Farmess tries again the next time this page is opened."
                      : data.message}
        </div>
      ) : result?.status === "insufficient_history" ? (
        <div className={styles.message}>
          <strong>Not enough history yet</strong>
          Farmess has {result.reportCount} report day(s) for this mandi. A trend needs at least{" "}
          {result.minimumReports}.{" "}
          {automatic?.view.busy
            ? "More are being fetched now."
            : "More are fetched automatically as data.gov.in publishes them."}
        </div>
      ) : result ? (
        <>
          <div className={styles.summary}>
            <div className={styles.stat}>
              <span>{`Latest modal price (${shortDate(result.trend.latestDate)})`}</span>
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
                  {`Expected by ${shortDate(bestLast.date)} (${best.label.toLowerCase()})`}
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
              ...(weatherPassed ? [{ points: weatherPassed.points, color: WEATHER_COLOR }] : []),
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
            {weatherPassed ? (
              <span>
                <i className={styles.swatch} style={{ background: WEATHER_COLOR }} />
                ML forecast with weather
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
            <table className={`produce-table ${styles.models}`}>
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
                      : staleNote
                        ? "No, prices are out of date"
                        : "No, not better than the baseline"}
                  </td>
                </tr>
                <tr>
                  <td>
                    {ml && ml.status !== "insufficient_data"
                      ? `Machine learning (gradient-boosted trees, ${ml.seriesUsed} mandi series)`
                      : "Machine learning (gradient-boosted trees)"}
                  </td>
                  <td>
                    {ml && ml.status !== "insufficient_data" ? rupees(ml.backtest.modelMae) : "—"}
                  </td>
                  <td>
                    {!ml
                      ? staleNote
                        ? "No, prices are out of date"
                        : "Not available"
                      : ml.status === "insufficient_data"
                        ? `No, needs ${ml.minimumSamples} training examples (has ${ml.trainingSamples})`
                        : mlPassed
                          ? "Yes, beat the baseline"
                          : "No, not better than the baseline"}
                  </td>
                </tr>
                <tr>
                  <td>
                    {weather && weather.status !== "insufficient_data"
                      ? `Machine learning with weather (rain and temperature of each mandi’s district, ${weather.seriesUsed} mandi series)`
                      : "Machine learning with weather (rain and temperature of each mandi’s district)"}
                  </td>
                  <td>
                    {weather && weather.status !== "insufficient_data"
                      ? rupees(weather.backtest.modelMae)
                      : "—"}
                  </td>
                  <td>
                    {!weather
                      ? staleNote
                        ? "No, prices are out of date"
                        : data?.weather?.status === "unavailable" &&
                            data.weather.reason === "weather_disabled"
                          ? "Not available on this server"
                          : "Not available"
                      : weather.status === "insufficient_data"
                        ? weather.reason === "no_weather"
                          ? "Weather for this district is being fetched"
                          : `No, needs ${weather.minimumSamples} training examples (has ${weather.trainingSamples})`
                        : weatherPassed
                          ? "Yes, beat the baseline"
                          : "No, not better than the baseline"}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {weather && weather.status !== "insufficient_data" ? (
            <p className={styles.note}>
              The weather model is tested the hard way: it gets only weather known on the day of the
              forecast. With the real weather of the following days its error would have been{" "}
              {rupees(weather.backtest.knownWeatherMae)}
              {weatherPassed
                ? `; weather inputs account for about ${Math.round(weatherPassed.weatherShare * 100)}% of what it learned.`
                : "."}
            </p>
          ) : null}

          <WeatherBlock outlook={data?.weatherOutlook} weather={weather} />

          <p className={styles.note}>
            {best && bestLast
              ? `Expected around ${rupees(bestLast.price)} per quintal by ${shortDate(bestLast.date)} (likely range ${rupees(bestLast.low)}–${rupees(bestLast.high)}), from the ${best.label.toLowerCase()}, which had the lowest error. This is an estimate, not a guaranteed price.`
              : staleNote
                ? `The latest saved report is from ${shortDate(result.trend.latestDate)}, so no forecast is shown. Newer prices are fetched automatically when data.gov.in publishes them.`
                : "No forecast is shown because no model was more accurate than assuming today’s price holds. The trend above is still real reported data."}
          </p>
        </>
      ) : null}
    </section>
  );
}
