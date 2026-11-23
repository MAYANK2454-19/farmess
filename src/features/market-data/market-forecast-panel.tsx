"use client";

import { useEffect, useState } from "react";

type ForecastRun = {
  id: string;
  crop: string;
  variety: string | null;
  market_name: string;
  horizon_days: number;
  model_name: string;
  model_version: string;
  training_observation_count: number;
  training_start: string;
  training_end: string;
  baseline_mae_paise_per_quintal: number;
  model_mae_paise_per_quintal: number;
  baseline_smape_percent: number | null;
  model_smape_percent: number | null;
  generated_at: string;
};

type ForecastPoint = {
  target_date: string;
  predicted_modal_price_paise_per_quintal: number;
  lower_bound_paise_per_quintal: number | null;
  upper_bound_paise_per_quintal: number | null;
};

type ForecastResponse =
  | {
      status: "approved";
      forecast: {
        run: ForecastRun;
        points: ForecastPoint[];
        priceUnit: string;
        confidenceMeaning: string;
      };
    }
  | {
      status: "insufficient_data";
      forecast: null;
      matchingObservationCount: number | null;
      message: string;
    };

function money(paise: number | null) {
  if (paise === null) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(paise / 100);
}

function dateLabel(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      }).format(date);
}

type ForecastRequestState = {
  key: string;
  result?: ForecastResponse;
  error?: string;
};

export function MarketForecastPanel({ crop, market }: { crop: string; market: string }) {
  const requestKey = `${crop.trim()}\u001f${market.trim()}`;
  const [requestState, setRequestState] = useState<ForecastRequestState | null>(null);
  const isCurrentRequest = requestState?.key === requestKey;
  const loading = !isCurrentRequest;
  const error = isCurrentRequest ? (requestState.error ?? "") : "";
  const result = isCurrentRequest ? (requestState.result ?? null) : null;

  useEffect(() => {
    let active = true;

    const params = new URLSearchParams();
    if (crop.trim()) params.set("crop", crop.trim());
    if (market.trim()) params.set("market", market.trim());

    void fetch(`/api/market-forecasts?${params.toString()}`, { cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json()) as ForecastResponse | { error?: string };
        if (!response.ok) {
          throw new Error(
            "error" in payload
              ? (payload.error ?? "Forecast could not be loaded.")
              : "Forecast could not be loaded.",
          );
        }
        if (active) setRequestState({ key: requestKey, result: payload as ForecastResponse });
      })
      .catch((requestError: unknown) => {
        if (active) {
          setRequestState({
            key: requestKey,
            error:
              requestError instanceof Error
                ? requestError.message
                : "Forecast could not be loaded.",
          });
        }
      });

    return () => {
      active = false;
    };
  }, [crop, market, requestKey]);

  return (
    <section className="panel market-forecast-panel" aria-labelledby="market-forecast-heading">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Decision support</p>
          <h2 className="panel-title" id="market-forecast-heading">
            Price trend forecast
          </h2>
          <p className="panel-caption">
            Only forecasts that passed a time-ordered evaluation are shown here.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="empty-state">
          <p className="empty-copy" role="status">
            Checking for an approved forecast…
          </p>
        </div>
      ) : error ? (
        <div className="empty-state">
          <p className="empty-copy" role="alert">
            {error}
          </p>
        </div>
      ) : result?.status === "insufficient_data" ? (
        <div className="market-forecast-empty">
          <p className="module-status">Forecast not enabled for this search</p>
          <h3>No validated forecast is available.</h3>
          <p>{result.message}</p>
          <p className="form-help">
            {result.matchingObservationCount === null
              ? "The observation count could not be checked."
              : `${result.matchingObservationCount} matching stored observation(s) are currently available.`}
          </p>
        </div>
      ) : result?.forecast ? (
        <>
          <div className="market-forecast-summary">
            <div>
              <span>Model</span>
              <strong>
                {result.forecast.run.model_name} · {result.forecast.run.model_version}
              </strong>
            </div>
            <div>
              <span>Training observations</span>
              <strong>{result.forecast.run.training_observation_count}</strong>
            </div>
            <div>
              <span>Back-test MAE</span>
              <strong>{money(result.forecast.run.model_mae_paise_per_quintal)}</strong>
            </div>
            <div>
              <span>Naive baseline MAE</span>
              <strong>{money(result.forecast.run.baseline_mae_paise_per_quintal)}</strong>
            </div>
          </div>
          {result.forecast.points.length ? (
            <div className="table-wrap">
              <table className="produce-table market-forecast-table">
                <thead>
                  <tr>
                    <th scope="col">Date</th>
                    <th scope="col">Predicted modal price</th>
                    <th scope="col">Lower bound</th>
                    <th scope="col">Upper bound</th>
                  </tr>
                </thead>
                <tbody>
                  {result.forecast.points.map((point) => (
                    <tr key={point.target_date}>
                      <td>{dateLabel(point.target_date)}</td>
                      <td>
                        <strong>{money(point.predicted_modal_price_paise_per_quintal)}</strong>
                      </td>
                      <td>{money(point.lower_bound_paise_per_quintal)}</td>
                      <td>{money(point.upper_bound_paise_per_quintal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="empty-copy">The approved model run has no forecast points attached.</p>
          )}
          <p className="market-forecast-footnote">{result.forecast.confidenceMeaning}</p>
          <p className="market-forecast-footnote">
            Generated {dateLabel(result.forecast.run.generated_at.slice(0, 10))}. A forecast is an
            estimate, not a guaranteed price or a recommendation to delay a sale.
          </p>
        </>
      ) : null}
    </section>
  );
}
