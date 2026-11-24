import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AdminOverviewPage() {
  const supabase = await createClient();
  const [observations, imports, forecasts, services] = await Promise.all([
    supabase.from("market_observations").select("id", { count: "exact", head: true }),
    supabase.from("market_data_ingestion_runs").select("id", { count: "exact", head: true }),
    supabase.from("market_forecast_runs").select("id", { count: "exact", head: true }),
    supabase
      .from("service_listings")
      .select("id", { count: "exact", head: true })
      .eq("status", "active"),
  ]);

  const metrics = [
    { label: "Stored market observations", value: observations.count, error: observations.error },
    { label: "Import attempts", value: imports.count, error: imports.error },
    { label: "Forecast runs", value: forecasts.count, error: forecasts.error },
    { label: "Active provider listings", value: services.count, error: services.error },
  ];
  const providers = [
    {
      name: "OGD / AGMARKNET",
      env: "DATA_GOV_IN_API_KEY",
      configured: Boolean(process.env.DATA_GOV_IN_API_KEY?.trim()),
    },
    {
      name: "HeiGIT road routing",
      env: "HEIGIT_API_KEY",
      configured: Boolean(process.env.HEIGIT_API_KEY?.trim()),
    },
    {
      name: "Open-Meteo production",
      env: "OPEN_METEO_CUSTOMER_API_KEY",
      configured: Boolean(process.env.OPEN_METEO_CUSTOMER_API_KEY?.trim()),
    },
  ];

  return (
    <main className="admin-content">
      <div className="admin-page-heading">
        <div>
          <p className="admin-eyebrow">Data stewardship</p>
          <h1>Operations overview</h1>
          <p>
            Manage source imports and model review. These tools are available only to authorised
            data stewards.
          </p>
        </div>
      </div>

      <section className="admin-metric-grid" aria-label="Farmess data metrics">
        {metrics.map((metric) => (
          <article className="admin-metric-card" key={metric.label}>
            <span>{metric.label}</span>
            <strong>{metric.error ? "—" : (metric.value ?? 0).toLocaleString("en-IN")}</strong>
            {metric.error ? <small>Could not read this count</small> : null}
          </article>
        ))}
      </section>

      <div className="admin-work-grid">
        <Link href="/admin/market-data" className="admin-work-card">
          <span className="admin-eyebrow">Source pipeline</span>
          <h2>Import mandi observations</h2>
          <p>
            Run a bounded OGD import, move through historical pages and inspect each ingestion
            audit.
          </p>
          <strong>Open market imports →</strong>
        </Link>
        <Link href="/admin/forecasts" className="admin-work-card">
          <span className="admin-eyebrow">Model governance</span>
          <h2>Review forecast candidates</h2>
          <p>
            Stage offline trainer output, examine baseline metrics and make a documented approval
            decision.
          </p>
          <strong>Open forecast review →</strong>
        </Link>
      </div>

      <section className="admin-panel">
        <div className="admin-section-heading">
          <div>
            <h2>Provider configuration</h2>
            <p>
              Only configuration presence is shown. Secret values are never returned to the browser.
            </p>
          </div>
        </div>
        <div className="admin-provider-list">
          {providers.map((provider) => (
            <div className="admin-provider-row" key={provider.env}>
              <div>
                <strong>{provider.name}</strong>
                <code>{provider.env}</code>
              </div>
              <span className={provider.configured ? "admin-pill admin-pill-ready" : "admin-pill"}>
                {provider.configured ? "Configured" : "Missing"}
              </span>
            </div>
          ))}
        </div>
        <p className="admin-disclaimer">
          Open-Meteo's paid customer key is required for production use. Do not paste API keys into
          this page or any browser-visible form; add them through the approved secret manager.
        </p>
      </section>

      <section className="admin-panel admin-warning-panel">
        <h2>Data readiness</h2>
        <p>
          Forecasts remain unavailable until enough genuine, dated market observations exist for
          each crop/market series. Provider recommendations also depend on real operators publishing
          verified services and keeping capacity, area and rates current.
        </p>
        <p>
          Current database counts should be treated as live operational state, not a demo dataset.
          Never seed invented market prices or provider listings to make the dashboard look
          populated.
        </p>
      </section>
    </main>
  );
}
