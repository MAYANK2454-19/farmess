"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { StateDistrictSelect } from "@/features/location/state-district-select";

type IngestionRun = {
  id: string;
  source_name: string;
  status: string;
  request_filters: unknown;
  records_received: number;
  records_upserted: number;
  error_message: string | null;
  started_at: string;
  completed_at: string;
};

type ImportResponse = {
  status?: string;
  recordsReceived?: number;
  recordsAccepted?: number;
  recordsRejected?: number;
  recordsUpserted?: number;
  duplicatesRemoved?: number;
  message?: string;
  error?: string;
};

function dateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}

export function AdminMarketImport({
  runs,
  apiKeyConfigured,
}: {
  runs: IngestionRun[];
  apiKeyConfigured: boolean;
}) {
  const router = useRouter();
  const [commodity, setCommodity] = useState("");
  const [state, setState] = useState("");
  const [district, setDistrict] = useState("");
  const [market, setMarket] = useState("");
  const [limit, setLimit] = useState("500");
  const [offset, setOffset] = useState("0");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ImportResponse | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    setResult(null);

    const parsedLimit = Number(limit);
    const parsedOffset = Number(offset);
    if (!Number.isSafeInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 500) {
      setError("Choose an import page size from 1 to 500.");
      setPending(false);
      return;
    }
    if (!Number.isSafeInteger(parsedOffset) || parsedOffset < 0 || parsedOffset > 100_000) {
      setError("Choose an offset from 0 to 100000.");
      setPending(false);
      return;
    }

    try {
      const response = await fetch("/api/market-data/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          commodity: commodity.trim() || undefined,
          state: state.trim() || undefined,
          district: district.trim() || undefined,
          market: market.trim() || undefined,
          limit: parsedLimit,
          offset: parsedOffset,
        }),
      });
      const payload = (await response.json()) as ImportResponse;
      if (!response.ok) {
        throw new Error(payload.error ?? payload.message ?? "Market data import failed.");
      }
      setResult(payload);
      router.refresh();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Market data import failed. Please try again.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="admin-stack">
      <section className="panel admin-panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Import today&apos;s prices</h2>
            <p className="panel-caption">
              Saves the prices mandis reported most recently (usually today or yesterday) from
              data.gov.in. Use it for a quick check; use Import past prices above for trends.
            </p>
          </div>
          <span className={apiKeyConfigured ? "admin-status admin-status-ready" : "admin-status"}>
            {apiKeyConfigured ? "Provider key configured" : "Provider key missing"}
          </span>
        </div>

        {!apiKeyConfigured ? (
          <p className="admin-notice" role="status">
            Add the server-only DATA_GOV_IN_API_KEY in Vercel and your local environment before
            importing. The key value is never displayed in this console.
          </p>
        ) : null}

        <form className="admin-form" onSubmit={handleSubmit}>
          <div className="admin-form-grid">
            <label>
              Commodity
              <input
                value={commodity}
                onChange={(event) => setCommodity(event.target.value)}
                placeholder="e.g. Onion"
                maxLength={120}
              />
            </label>
            <StateDistrictSelect
              idPrefix="admin-import"
              state={state}
              district={district}
              onChange={(next) => {
                setState(next.state);
                setDistrict(next.district);
              }}
            />
            <label>
              Mandi
              <input
                value={market}
                onChange={(event) => setMarket(event.target.value)}
                placeholder="Optional market"
                maxLength={120}
              />
            </label>
            <label>
              How many rows
              <input
                type="number"
                min={1}
                max={500}
                step={1}
                value={limit}
                onChange={(event) => setLimit(event.target.value)}
                required
              />
            </label>
            <label>
              Skip first rows (advanced)
              <input
                type="number"
                min={0}
                max={100000}
                step={1}
                value={offset}
                onChange={(event) => setOffset(event.target.value)}
                required
              />
            </label>
          </div>
          <p className="admin-help">
            Leave &ldquo;Skip first rows&rdquo; at 0 to get the newest prices.
          </p>
          {error ? (
            <p className="admin-error" role="alert">
              {error}
            </p>
          ) : null}
          {result ? (
            <div className="admin-result" role="status">
              <strong>Import result: {result.status ?? "completed"}</strong>
              <p>{result.message ?? "The source response was processed."}</p>
              <div className="admin-metrics">
                <span>
                  Received <strong>{result.recordsReceived ?? 0}</strong>
                </span>
                <span>
                  Accepted <strong>{result.recordsAccepted ?? 0}</strong>
                </span>
                <span>
                  Rejected <strong>{result.recordsRejected ?? 0}</strong>
                </span>
                <span>
                  Upserted <strong>{result.recordsUpserted ?? 0}</strong>
                </span>
                <span>
                  Duplicates removed <strong>{result.duplicatesRemoved ?? 0}</strong>
                </span>
              </div>
            </div>
          ) : null}
          <button className="button button-primary" type="submit" disabled={pending}>
            {pending ? "Importing…" : "Import today’s prices"}
          </button>
        </form>
      </section>

      <section className="panel admin-panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Import log</h2>
            <p className="panel-caption">
              Every import, what it asked for, and how many rows were saved.
            </p>
          </div>
        </div>
        {runs.length === 0 ? (
          <div className="admin-empty">
            <strong>No ingestion attempts recorded.</strong>
            <p>After the provider key is configured, your first import will appear here.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="produce-table">
              <thead>
                <tr>
                  <th scope="col">Started</th>
                  <th scope="col">Source</th>
                  <th scope="col">Status</th>
                  <th scope="col">Received</th>
                  <th scope="col">Saved</th>
                  <th scope="col">Filters</th>
                  <th scope="col">Note</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.id}>
                    <td>{dateTime(run.started_at)}</td>
                    <td>{run.source_name}</td>
                    <td>
                      <span className="admin-status">{run.status}</span>
                    </td>
                    <td>{run.records_received}</td>
                    <td>{run.records_upserted}</td>
                    <td>
                      <code>{JSON.stringify(run.request_filters)}</code>
                    </td>
                    <td>{run.error_message ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
