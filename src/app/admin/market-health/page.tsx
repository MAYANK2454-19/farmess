import { summarizeMarketDataHealth } from "@/features/admin/market-health";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return "Invalid date";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function statusLabel(status: string) {
  return status === "fresh"
    ? "Within 48 hours"
    : status === "stale"
      ? "Older than 48 hours"
      : status === "future"
        ? "Future-dated"
        : "Date unavailable";
}

export default async function AdminMarketHealthPage() {
  const supabase = await createClient();
  const { data, count, error } = await supabase
    .from("market_observations")
    .select(
      "crop,variety,state,district,market_name,observation_date,source_name,modal_price_paise_per_quintal",
      { count: "exact" },
    )
    .order("observation_date", { ascending: false })
    .limit(5000);

  const health = summarizeMarketDataHealth(
    (data ?? []).map((record) => ({
      ...record,
      modal_price_paise_per_quintal:
        record.modal_price_paise_per_quintal === null
          ? null
          : Number(record.modal_price_paise_per_quintal),
    })),
    count ?? data?.length ?? 0,
  );

  return (
    <main className="admin-content">
      <div className="admin-page-heading">
        <div>
          <p className="admin-eyebrow">Market data quality</p>
          <h1>Coverage & freshness</h1>
          <p>
            Read-only diagnostics from saved market observations. Review coverage and the latest
            dated record for each mandi before relying on market comparisons or forecast training.
          </p>
        </div>
      </div>

      {error ? (
        <p className="admin-error" role="alert">
          Market observations could not be inspected. Check the admin read policy and try again.
        </p>
      ) : (
        <>
          <section className="admin-health-grid" aria-label="Market data coverage metrics">
            <article className="admin-metric-card">
              <span>Stored observations</span>
              <strong>{health.totalObservations.toLocaleString("en-IN")}</strong>
              <small>Exact database count</small>
            </article>
            <article className="admin-metric-card">
              <span>Crop types</span>
              <strong>{health.cropCount.toLocaleString("en-IN")}</strong>
              <small>In latest sample</small>
            </article>
            <article className="admin-metric-card">
              <span>Markets covered</span>
              <strong>{health.marketCount.toLocaleString("en-IN")}</strong>
              <small>Market + district + state</small>
            </article>
            <article className="admin-metric-card">
              <span>Crop / market series</span>
              <strong>{health.seriesCount.toLocaleString("en-IN")}</strong>
              <small>Crop, variety and geography</small>
            </article>
          </section>

          <section className="admin-panel">
            <div className="admin-section-heading">
              <h2>Observation quality</h2>
              <p>
                Freshness uses the existing 48-hour policy. Historical rows are expected to become
                stale; market attention is based on each market&apos;s newest observation.
              </p>
            </div>
            <div className="admin-health-quality-grid">
              <div><strong>{health.freshness.fresh}</strong><span>Within 48 hours</span></div>
              <div><strong>{health.freshness.stale}</strong><span>Older than 48 hours</span></div>
              <div><strong>{health.freshness.future}</strong><span>Future-dated</span></div>
              <div><strong>{health.freshness.invalid}</strong><span>Invalid dates</span></div>
              <div><strong>{health.missingModalPriceCount}</strong><span>Missing modal price</span></div>
            </div>
            <p className="admin-help">
              Valid observation dates in this sample: {formatDate(health.dateRange.oldest)} to{" "}
              {formatDate(health.dateRange.newest)}.
            </p>
          </section>

          <section className="admin-panel">
            <div className="admin-section-heading">
              <h2>Markets needing attention</h2>
              <p>Markets are listed only when their newest stored observation is not fresh.</p>
            </div>
            {health.marketsNeedingReview.length === 0 ? (
              <div className="admin-empty">
                <strong>No market needs a freshness review in this sample.</strong>
                <p>This is not a guarantee that every market has complete or sufficient history.</p>
              </div>
            ) : (
              <div className="table-wrap">
                <table className="produce-table">
                  <thead><tr><th>Market</th><th>Observations</th><th>Latest date</th><th>Latest status</th></tr></thead>
                  <tbody>
                    {health.marketsNeedingReview.map((market) => (
                      <tr key={market.name}>
                        <td><strong>{market.name}</strong></td>
                        <td>{market.observations}</td>
                        <td>{formatDate(market.latestObservationDate)}</td>
                        <td><span className="admin-status">{statusLabel(market.latestStatus)}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="admin-panel">
            <div className="admin-section-heading">
              <h2>Source coverage</h2>
              <p>Counts and latest observation date by recorded source name.</p>
            </div>
            {health.sources.length === 0 ? (
              <div className="admin-empty">
                <strong>No source-backed observations are stored yet.</strong>
                <p>Run a verified import from Market imports after configuring the provider key.</p>
              </div>
            ) : (
              <div className="table-wrap">
                <table className="produce-table">
                  <thead><tr><th>Source</th><th>Observations in sample</th><th>Latest date</th><th>Latest status</th></tr></thead>
                  <tbody>
                    {health.sources.map((source) => (
                      <tr key={source.name}>
                        <td><strong>{source.name}</strong></td>
                        <td>{source.observations}</td>
                        <td>{formatDate(source.latestObservationDate)}</td>
                        <td><span className="admin-status">{statusLabel(source.latestStatus)}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          <p className="admin-help">
            {health.sampledObservations.toLocaleString("en-IN")} most recent records inspected.
            {health.sampleIsLimited
              ? " The database contains more records; coverage breakdowns describe only this latest 5,000-record sample."
              : " The sample includes every stored observation."}
          </p>
        </>
      )}
    </main>
  );
}
