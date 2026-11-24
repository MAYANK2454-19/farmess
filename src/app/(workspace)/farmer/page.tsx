import Link from "next/link";
import { Icon, type IconName } from "@/components/icons";
import { getFarmessSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

const DAY_MS = 24 * 60 * 60 * 1000;
const RECENT_LOT_LIMIT = 5;
const SUMMARY_LOT_LIMIT = 200;

type OverviewLot = {
  id: string;
  crop: string;
  variety: string | null;
  quantity: number;
  unit: string;
  sell_by: string;
  status: string;
  approximate_area: string;
};

function formatQuantity(value: number) {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 3 }).format(value);
}

function parseDateOnly(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value: string) {
  const date = parseDateOnly(value);
  return date
    ? new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", timeZone: "UTC" }).format(
        date,
      )
    : value;
}

function todayUtcDateOnly() {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

function daysUntil(value: string) {
  const date = parseDateOnly(value);
  return date ? Math.round((date.getTime() - todayUtcDateOnly()) / DAY_MS) : null;
}

function isOpenLot(status: string) {
  return status !== "sold" && status !== "closed";
}

function sellByLabel(value: string, status: string) {
  if (!isOpenLot(status)) return { text: `Sell by ${formatDate(value)}`, tone: "neutral" };
  const days = daysUntil(value);
  if (days === null) return { text: `Sell by ${value}`, tone: "neutral" };
  if (days < 0) return { text: `Sell-by passed ${formatDate(value)}`, tone: "danger" };
  if (days === 0) return { text: "Sell by today", tone: "danger" };
  if (days <= 3)
    return { text: `Sell within ${days} day${days === 1 ? "" : "s"}`, tone: "warning" };
  return { text: `Sell by ${formatDate(value)}`, tone: "neutral" };
}

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function greeting() {
  const hour = Number(
    new Intl.DateTimeFormat("en-IN", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" })
      .formatToParts(new Date())
      .find((part) => part.type === "hour")?.value ?? 12,
  );
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

const DECISION_STEPS: { title: string; copy: string; href: string; icon: IconName }[] = [
  {
    title: "Record your produce",
    copy: "Crop, quantity, grade and the date it must be sold by.",
    href: "/farmer/produce/new",
    icon: "produce",
  },
  {
    title: "Check reported prices",
    copy: "Dated mandi observations with their source and unit.",
    href: "/farmer/markets",
    icon: "markets",
  },
  {
    title: "Compare net return",
    copy: "Subtract transport, handling and market charges.",
    href: "/farmer/compare",
    icon: "compare",
  },
  {
    title: "Review offers & logistics",
    copy: "Respond to buyers and request transport or storage.",
    href: "/farmer/offers",
    icon: "offers",
  },
];

const TOOLS: { title: string; copy: string; href: string; icon: IconName }[] = [
  {
    title: "Market prices",
    copy: "Reported min, max and modal prices by mandi and date.",
    href: "/farmer/markets",
    icon: "markets",
  },
  {
    title: "Net return calculator",
    copy: "Gross value minus every deduction, per quintal and per lot.",
    href: "/farmer/compare",
    icon: "rupee",
  },
  {
    title: "Transport & storage",
    copy: "Nearby services ranked with a transparent explanation.",
    href: "/farmer/logistics",
    icon: "logistics",
  },
  {
    title: "Sale activity",
    copy: "Agreed terms, dispatch and payment-status milestones.",
    href: "/farmer/activity",
    icon: "activity",
  },
];

export default async function FarmerOverviewPage() {
  const session = await getFarmessSession();
  const supabase = await createClient();

  const { data, error } = session
    ? await supabase
        .from("produce_lots")
        .select("id,crop,variety,quantity,unit,sell_by,status,approximate_area")
        .eq("owner_id", session.userId)
        .order("created_at", { ascending: false })
        .limit(SUMMARY_LOT_LIMIT)
    : { data: null, error: new Error("No active session") };

  const lots: OverviewLot[] = data ?? [];
  const recentLots = lots.slice(0, RECENT_LOT_LIMIT);
  const openLots = lots.filter((lot) => isOpenLot(lot.status));
  const publishedCount = lots.filter((lot) => lot.status === "published").length;
  const urgentCount = openLots.filter((lot) => {
    const days = daysUntil(lot.sell_by);
    return days !== null && days <= 3;
  }).length;
  const firstName = session?.displayName.split(/\s+/)[0] ?? "there";

  const stats: { label: string; value: string; hint: string; tone?: "warning" }[] = [
    {
      label: "Open produce lots",
      value: error ? "—" : String(openLots.length),
      hint: "Draft or published, not yet sold",
    },
    {
      label: "Visible to buyers",
      value: error ? "—" : String(publishedCount),
      hint: "Published lots buyers can make offers on",
    },
    {
      label: "Sell within 3 days",
      value: error ? "—" : String(urgentCount),
      hint: urgentCount > 0 ? "Check prices and offers today" : "No lots near their sell-by date",
      tone: urgentCount > 0 ? "warning" : undefined,
    },
  ];

  return (
    <main className="content farm-overview">
      <section className="dashboard-hero" aria-labelledby="overview-title">
        <div>
          <p className="eyebrow">{greeting()}</p>
          <h1 id="overview-title">Welcome back, {firstName}</h1>
          <p className="page-subtitle">
            Know the market, understand the costs and decide with confidence — every price shows its
            source and date.
          </p>
        </div>
        <div className="dashboard-hero-actions">
          <Link href="/farmer/markets" className="button button-secondary">
            <Icon name="markets" size={16} />
            Check prices
          </Link>
          <Link href="/farmer/produce/new" className="button button-primary">
            <Icon name="plus" size={16} />
            Add produce lot
          </Link>
        </div>
      </section>

      <section className="stat-grid" aria-label="Produce summary">
        {stats.map((stat) => (
          <article
            key={stat.label}
            className={"stat-card" + (stat.tone === "warning" ? " stat-card-warning" : "")}
          >
            <p className="stat-label">{stat.label}</p>
            <p className="stat-value">{stat.value}</p>
            <p className="stat-hint">{stat.hint}</p>
          </article>
        ))}
      </section>

      <div className="dashboard-grid">
        <section className="panel" aria-labelledby="produce-heading">
          <header className="panel-header">
            <div>
              <h2 className="panel-title" id="produce-heading">
                Recent produce lots
              </h2>
              <p className="panel-caption">
                {error
                  ? "Your records could not be loaded."
                  : "Your most recently recorded lots and their selling window."}
              </p>
            </div>
            <Link href="/farmer/produce" className="text-link">
              View all <Icon name="arrow" size={14} />
            </Link>
          </header>

          {error ? (
            <div className="empty-state" role="alert">
              <span className="empty-badge empty-badge-warning" aria-hidden="true">
                <Icon name="alert" size={20} />
              </span>
              <h3 className="empty-title">Unable to load your produce</h3>
              <p className="empty-copy">
                Your saved records have not been changed. Refresh the page or try again shortly.
              </p>
            </div>
          ) : recentLots.length > 0 ? (
            <ul className="lot-rows">
              {recentLots.map((lot) => {
                const sellBy = sellByLabel(lot.sell_by, lot.status);
                return (
                  <li key={lot.id}>
                    <Link href="/farmer/produce" className="lot-row">
                      <span className="lot-avatar" aria-hidden="true">
                        {lot.crop.charAt(0).toUpperCase()}
                      </span>
                      <span className="lot-main">
                        <strong>
                          {lot.crop}
                          {lot.variety ? <em> · {lot.variety}</em> : null}
                        </strong>
                        <span>
                          {formatQuantity(lot.quantity)} {lot.unit} · {lot.approximate_area}
                        </span>
                      </span>
                      <span className={"lot-deadline lot-deadline-" + sellBy.tone}>
                        <Icon name="clock" size={14} />
                        {sellBy.text}
                      </span>
                      <span className={"produce-status produce-status-" + lot.status}>
                        {titleCase(lot.status)}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="empty-state">
              <span className="empty-badge" aria-hidden="true">
                <Icon name="produce" size={20} />
              </span>
              <h3 className="empty-title">No produce recorded yet</h3>
              <p className="empty-copy">
                Start with one lot: crop, quantity, grade, collection area and the date you need to
                sell by. You can review everything before saving.
              </p>
              <Link href="/farmer/produce/new" className="button button-primary empty-action">
                <Icon name="plus" size={16} />
                Record your first lot
              </Link>
            </div>
          )}
        </section>

        <aside className="panel decision-card" aria-labelledby="steps-heading">
          <header className="panel-header">
            <div>
              <h2 className="panel-title" id="steps-heading">
                Your selling decision
              </h2>
              <p className="panel-caption">Four steps from harvest to a confident sale.</p>
            </div>
          </header>
          <ol className="decision-list">
            {DECISION_STEPS.map((step, index) => (
              <li key={step.title}>
                <Link href={step.href} className="decision-list-item">
                  <span className="decision-index" aria-hidden="true">
                    {index + 1}
                  </span>
                  <span className="decision-copy">
                    <strong>{step.title}</strong>
                    <span>{step.copy}</span>
                  </span>
                  <Icon name="chevron" size={16} className="decision-chevron" />
                </Link>
              </li>
            ))}
          </ol>
        </aside>
      </div>

      <section className="tool-section" aria-labelledby="tools-heading">
        <div className="section-title-row">
          <h2 id="tools-heading">Decision tools</h2>
        </div>
        <div className="tool-grid">
          {TOOLS.map((tool) => (
            <Link key={tool.href} href={tool.href} className="tool-card">
              <span className="tool-card-icon" aria-hidden="true">
                <Icon name={tool.icon} size={19} />
              </span>
              <strong>{tool.title}</strong>
              <span>{tool.copy}</span>
              <span className="tool-card-cta">
                Open <Icon name="arrow" size={14} />
              </span>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
