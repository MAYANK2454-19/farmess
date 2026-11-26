import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AdminOverviewPage() {
  const supabase = await createClient();
  const [observations, imports, pendingRequests, services] = await Promise.all([
    supabase.from("market_observations").select("id", { count: "exact", head: true }),
    supabase.from("market_data_ingestion_runs").select("id", { count: "exact", head: true }),
    supabase
      .from("role_access_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    supabase
      .from("service_listings")
      .select("id", { count: "exact", head: true })
      .eq("status", "active"),
  ]);

  const metrics = [
    { label: "Mandi prices saved", value: observations.count, error: observations.error },
    { label: "Imports run", value: imports.count, error: imports.error },
    {
      label: "Access requests waiting",
      value: pendingRequests.count,
      error: pendingRequests.error,
    },
    { label: "Active transport & storage", value: services.count, error: services.error },
  ];

  const services_ = [
    {
      name: "Mandi prices (data.gov.in)",
      purpose: "Needed for price search and imports.",
      configured: Boolean(process.env.DATA_GOV_IN_API_KEY?.trim()),
      optional: false,
    },
    {
      name: "Weather (Open-Meteo)",
      purpose: "Rain and temperature on the transport & storage page.",
      configured:
        Boolean(process.env.OPEN_METEO_CUSTOMER_API_KEY?.trim()) ||
        process.env.OPEN_METEO_NON_COMMERCIAL_USE?.trim() === "true",
      optional: false,
    },
    {
      name: "Road distances (HeiGIT)",
      purpose:
        "Optional. Adds real road distance and drive time; without it Farmess shows straight-line distance.",
      configured: Boolean(process.env.HEIGIT_API_KEY?.trim()),
      optional: true,
    },
  ];

  const tasks = [
    {
      href: "/admin/access-requests",
      tag: "People",
      title: "Approve buyers and transporters",
      body: "Farmers who want buyer or transport & storage access ask here. Check who they are, then approve or reject with a short note.",
      cta: "Open access requests",
    },
    {
      href: "/admin/market-data",
      tag: "Prices",
      title: "Import mandi prices",
      body: "Pull today's government (AGMARKNET) prices for a crop, state and district into Farmess. This fills the price history and trend charts.",
      cta: "Open market imports",
    },
    {
      href: "/admin/market-health",
      tag: "Prices",
      title: "Check price data",
      body: "See which crops and markets have prices saved and how recent they are, so you know what to import next.",
      cta: "Open data health",
    },
    {
      href: "/admin/providers",
      tag: "Trust",
      title: "Verify transport & storage",
      body: "Mark transport and cold-storage listings as checked (for example after a phone call), so farmers know which ones are verified.",
      cta: "Open provider review",
    },
  ];

  return (
    <main className="admin-content">
      <div className="admin-page-heading">
        <div>
          <p className="admin-eyebrow">Admin</p>
          <h1>Admin overview</h1>
          <p>
            Keep Farmess trustworthy: approve who can buy or transport, bring in real government
            prices, and verify service providers.
          </p>
        </div>
      </div>

      <section className="admin-metric-grid" aria-label="Farmess at a glance">
        {metrics.map((metric) => (
          <article className="admin-metric-card" key={metric.label}>
            <span>{metric.label}</span>
            <strong>{metric.error ? "—" : (metric.value ?? 0).toLocaleString("en-IN")}</strong>
            {metric.error ? <small>Could not read this count</small> : null}
          </article>
        ))}
      </section>

      <div className="admin-work-grid">
        {tasks.map((task) => (
          <Link href={task.href} className="admin-work-card" key={task.href}>
            <span className="admin-eyebrow">{task.tag}</span>
            <h2>{task.title}</h2>
            <p>{task.body}</p>
            <strong>{task.cta} →</strong>
          </Link>
        ))}
      </div>

      <section className="admin-panel">
        <div className="admin-section-heading">
          <div>
            <h2>Connected services</h2>
            <p>Shows only whether each key is set. Key values are never shown here.</p>
          </div>
        </div>
        <div className="admin-provider-list">
          {services_.map((service) => (
            <div className="admin-provider-row" key={service.name}>
              <div>
                <strong>{service.name}</strong>
                <span>{service.purpose}</span>
              </div>
              <span className={service.configured ? "admin-pill admin-pill-ready" : "admin-pill"}>
                {service.configured
                  ? "Connected"
                  : service.optional
                    ? "Optional — not set"
                    : "Missing"}
              </span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
