"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { marketPriceRecordsToCsv } from "@/lib/market-data/csv";
import type { MarketDataResult, MarketPriceRecord } from "@/lib/market-data/types";
import { MarketHistoryChart } from "./market-history-chart";
import { MarketForecastPanel } from "@/features/market-data/market-forecast-panel";
import styles from "./markets.module.css";

type Filters = { commodity: string; state: string; district: string; market: string };

const EMPTY_FILTERS: Filters = { commodity: "", state: "", district: "", market: "" };

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
    : new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(
        date,
      );
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export default function MarketsPage() {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [result, setResult] = useState<MarketDataResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadPrices = useCallback(async (nextFilters: Filters) => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(nextFilters)) {
      if (value.trim()) params.set(key, value.trim());
    }

    try {
      const response = await fetch(`/api/market-prices?${params.toString()}`, {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      const payload = (await response.json()) as MarketDataResult;
      if (!response.ok && payload.status !== "unavailable") {
        throw new Error("Market data request failed. Please try again.");
      }
      setResult(payload);
    } catch (requestError) {
      setResult(null);
      setError(
        requestError instanceof Error ? requestError.message : "Unable to load market prices.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(() => loadPrices(EMPTY_FILTERS));
  }, [loadPrices]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void loadPrices(filters);
  }

  function handleReset() {
    setFilters(EMPTY_FILTERS);
    void loadPrices(EMPTY_FILTERS);
  }

  const records = result?.records ?? [];

  function handleExport() {
    if (records.length === 0) return;

    const csv = marketPriceRecordsToCsv(records);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const date = new Date().toISOString().slice(0, 10);

    link.href = objectUrl;
    link.download = `farmess-market-prices-${date}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  }

  return (
    <main className={`content ${styles.page}`}>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Market information</p>
          <h1>Market Prices</h1>
          <p className="page-subtitle">
            Explore reported mandi observations with their source, date and price unit.
          </p>
        </div>
        <div className={styles.headingActions}>
          <button
            className="button button-secondary"
            type="button"
            onClick={handleExport}
            disabled={loading || records.length === 0}
          >
            Export CSV
          </button>
          <button
            className="button button-secondary"
            type="button"
            onClick={() => void loadPrices(filters)}
            disabled={loading}
          >
            {loading ? "Refreshing…" : "Refresh data"}
          </button>
        </div>
      </div>

      <div className="preview-banner" role="note">
        <span className="banner-dot" aria-hidden="true" />
        <span>
          <strong>Daily reported observations</strong> — these are not live quotes or guaranteed
          selling prices.
        </span>
      </div>

      <section className={`panel ${styles.filterPanel}`} aria-labelledby="filter-heading">
        <div className="panel-header">
          <div>
            <h2 className="panel-title" id="filter-heading">
              Find market observations
            </h2>
            <p className="panel-caption">
              Filters are optional. Leave them blank to request the latest available records.
            </p>
          </div>
        </div>
        <form className={styles.filters} onSubmit={handleSubmit}>
          <label className="form-field">
            <span className="form-label">Commodity</span>
            <input
              className="form-control"
              value={filters.commodity}
              onChange={(event) => setFilters({ ...filters, commodity: event.target.value })}
              placeholder="e.g. Wheat"
              maxLength={100}
            />
          </label>
          <label className="form-field">
            <span className="form-label">State</span>
            <input
              className="form-control"
              value={filters.state}
              onChange={(event) => setFilters({ ...filters, state: event.target.value })}
              placeholder="e.g. Rajasthan"
              maxLength={100}
            />
          </label>
          <label className="form-field">
            <span className="form-label">District</span>
            <input
              className="form-control"
              value={filters.district}
              onChange={(event) => setFilters({ ...filters, district: event.target.value })}
              placeholder="District name"
              maxLength={100}
            />
          </label>
          <label className="form-field">
            <span className="form-label">Mandi / market</span>
            <input
              className="form-control"
              value={filters.market}
              onChange={(event) => setFilters({ ...filters, market: event.target.value })}
              placeholder="Market name"
              maxLength={100}
            />
          </label>
          <div className={styles.filterActions}>
            <button className="button button-primary" type="submit" disabled={loading}>
              {loading ? "Searching…" : "Search prices"}
            </button>
            <button
              className="button button-secondary"
              type="button"
              onClick={handleReset}
              disabled={loading}
            >
              Clear filters
            </button>
          </div>
        </form>
      </section>

      <section
        className={styles.resultsSection}
        aria-labelledby="results-heading"
        aria-live="polite"
      >
        <div className={styles.resultsHeading}>
          <div>
            <h2 id="results-heading">Market observations</h2>
            <p>
              {loading
                ? "Checking the selected data source…"
                : `${records.length} reported record${records.length === 1 ? "" : "s"} returned`}
            </p>
          </div>
          {result && <span className={styles.sourceTag}>{result.sourceName}</span>}
        </div>

        {loading && (
          <div className={`panel ${styles.statePanel}`} role="status">
            <span className={styles.spinner} aria-hidden="true" />
            <strong>Loading market data</strong>
            <p>Connecting to the configured market-data source.</p>
          </div>
        )}

        {!loading && error && (
          <div className={`panel ${styles.statePanel}`} role="alert">
            <strong>Could not load market prices</strong>
            <p>{error}</p>
            <button
              className="button button-secondary"
              type="button"
              onClick={() => void loadPrices(filters)}
            >
              Try again
            </button>
          </div>
        )}

        {!loading && result?.status === "unavailable" && (
          <div className={`panel ${styles.statePanel}`} role="status">
            <strong>Market source unavailable</strong>
            <p>{result.message}</p>
            <p className={styles.muted}>No sample prices are shown in place of source data.</p>
            <p className={styles.timestamp}>Last checked: {formatTimestamp(result.retrievedAt)}</p>
          </div>
        )}

        {!loading && result?.status === "no-data" && (
          <div className={`panel ${styles.statePanel}`} role="status">
            <strong>No matching observations found</strong>
            <p>
              The source returned no records for these filters. Try a broader commodity, state or
              market search.
            </p>
            <p className={styles.timestamp}>Last checked: {formatTimestamp(result.retrievedAt)}</p>
          </div>
        )}

        {!loading && result?.status === "stale" && (
          <div className={styles.staleNotice} role="status">
            <strong>Older observations</strong>
            <span>{result.message}</span>
          </div>
        )}

        {!loading && records.length > 0 && <MarketHistoryChart records={records} />}

        {!loading && <MarketForecastPanel crop={filters.commodity} market={filters.market} />}

        {!loading && records.length > 0 && (
          <div className={styles.recordList}>
            {records.map((record) => (
              <article className={`panel ${styles.recordCard}`} key={record.id}>
                <div className={styles.recordTop}>
                  <div>
                    <h3>{record.commodity}</h3>
                    <p>
                      {[record.variety, record.market, record.district, record.state]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <span className={styles.reportedTag}>Reported</span>
                </div>
                <div className={styles.priceGrid}>
                  <div>
                    <span>Minimum</span>
                    <strong>₹{formatPrice(record.minPrice)}</strong>
                  </div>
                  <div>
                    <span>Modal</span>
                    <strong>₹{formatPrice(record.modalPrice)}</strong>
                  </div>
                  <div>
                    <span>Maximum</span>
                    <strong>₹{formatPrice(record.maxPrice)}</strong>
                  </div>
                </div>
                <div className={styles.recordMeta}>
                  <span>
                    Observed: <strong>{formatDate(record.observationDate)}</strong>
                  </span>
                  <span>
                    Unit: <strong>{record.priceUnit}</strong>
                  </span>
                  <span>
                    Retrieved: <strong>{formatTimestamp(record.retrievedAt)}</strong>
                  </span>
                </div>
                <a
                  className={styles.sourceLink}
                  href={record.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  View source resource <span aria-hidden="true">↗</span>
                </a>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
