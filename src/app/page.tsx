import Link from "next/link";
import { redirect } from "next/navigation";
import { BrandLogo } from "@/components/brand-logo";
import { Icon, type IconName } from "@/components/icons";
import { getFarmessSession } from "@/lib/auth/session";

// Worked example only — rendered with an "Illustrative" label, never as market data.
const EXAMPLE = {
  crop: "Tomato",
  quantityQuintal: 10,
  rows: [
    { label: "Expected sale value (10 q × ₹1,800)", amount: 18000, deduction: false },
    { label: "Transport", amount: -1500, deduction: true },
    { label: "Handling & packaging", amount: -600, deduction: true },
    { label: "Market charges", amount: -360, deduction: true },
    { label: "Expected quality loss", amount: -540, deduction: true },
  ],
};

const STEPS = [
  {
    title: "Record your produce",
    copy: "Crop, variety, grade, quantity and the date it must be sold by.",
  },
  {
    title: "Check reported prices",
    copy: "Dated mandi observations from AGMARKNET, with source, unit and freshness.",
  },
  {
    title: "Compare net return",
    copy: "Every deduction is visible. Unknown costs are flagged, never counted as zero.",
  },
  {
    title: "Sell on your terms",
    copy: "Review buyer offers and request transport or storage — you make the final call.",
  },
];

const PRINCIPLES: { icon: IconName; title: string; copy: string }[] = [
  {
    icon: "clock",
    title: "Every price is dated",
    copy: "A daily mandi report is not a live quote. Farmess shows when and where each price was reported, and labels stale data.",
  },
  {
    icon: "rupee",
    title: "Net return before headline price",
    copy: "A distant mandi may quote more but leave you with less after transport, charges and spoilage.",
  },
  {
    icon: "shield",
    title: "Private by default",
    copy: "Your exact location and phone number are never shown to buyers without your consent.",
  },
];

const ROLES = [
  {
    title: "Farmers",
    copy: "Record lots, compare markets, review offers and request logistics.",
  },
  {
    title: "Buyers",
    copy: "Post requirements, find compatible published lots and make clear offers.",
  },
  {
    title: "Transport & storage operators",
    copy: "List services with capacity and rates, and respond to farmer requests.",
  },
];

function formatRupees(value: number) {
  const formatted = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(
    Math.abs(value),
  );
  return (value < 0 ? "− ₹" : "₹") + formatted;
}

export default async function HomePage() {
  const session = await getFarmessSession();

  if (session?.role === "farmer") redirect("/farmer");
  if (session?.role === "buyer") redirect("/buyer");
  if (session?.role === "operator") redirect("/operator");
  if (session?.role === "admin") redirect("/admin");

  const net = EXAMPLE.rows.reduce((total, row) => total + row.amount, 0);

  return (
    <div className="landing">
      <div className="field-ground landing-hero">
        <header className="landing-header">
          <Link href="/" aria-label="Farmess home">
            <BrandLogo size={36} tone="light" />
          </Link>
          <nav className="landing-nav" aria-label="Site">
            <a href="#how-it-works">How it works</a>
            <a href="#principles">Principles</a>
            <a href="#who">Who it is for</a>
            <Link href="/login" className="button button-accent">
              Sign in
            </Link>
          </nav>
        </header>

        <section className="landing-hero-inner" aria-labelledby="landing-title">
          <div>
            <p className="landing-kicker" lang="hi">
              खेत से मंडी तक — सही दाम, सही समय
            </p>
            <h1 className="landing-title" id="landing-title">
              Sell your harvest with the full picture.
            </h1>
            <p className="landing-lede">
              Farmess helps small farmers compare reported mandi prices, see every selling cost and
              choose where and when to sell — before the produce spoils.
            </p>
            <div className="landing-actions">
              <Link href="/login" className="button button-accent">
                Get started <Icon name="arrow" size={16} />
              </Link>
              <a href="#how-it-works" className="button button-secondary">
                See how it works
              </a>
            </div>
          </div>

          <aside className="netback-card" aria-label="Illustrative net return example">
            <div className="netback-card-head">
              <strong>
                {EXAMPLE.crop} · {EXAMPLE.quantityQuintal} quintal
              </strong>
              <span className="netback-tag">Illustrative example</span>
            </div>
            <ul className="netback-rows">
              {EXAMPLE.rows.map((row) => (
                <li key={row.label} className={row.deduction ? "deduction" : undefined}>
                  <span>{row.label}</span>
                  <span>{formatRupees(row.amount)}</span>
                </li>
              ))}
            </ul>
            <div className="netback-total">
              <span>Estimated net return</span>
              <strong>{formatRupees(net)}</strong>
            </div>
            <p className="netback-note">
              Figures are for explanation only. In Farmess every price carries its source and date,
              and every cost is entered or verified by you.
            </p>
          </aside>
        </section>
      </div>

      <section className="landing-section" id="how-it-works" aria-labelledby="how-title">
        <h2 id="how-title">From harvest to a confident sale in four steps.</h2>
        <p>One clear path for the farmer — no jargon, no hidden assumptions.</p>
        <ol className="landing-steps">
          {STEPS.map((step, index) => (
            <li key={step.title}>
              <span className="landing-step-number">{String(index + 1).padStart(2, "0")}</span>
              <strong>{step.title}</strong>
              <p>{step.copy}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="landing-section" id="principles" aria-labelledby="principles-title">
        <h2 id="principles-title">Built on information you can check.</h2>
        <p>Farmess supports the decision. The farmer stays in control of every sale.</p>
        <div className="landing-principles">
          {PRINCIPLES.map((principle) => (
            <article key={principle.title}>
              <Icon name={principle.icon} size={26} />
              <h3>{principle.title}</h3>
              <p>{principle.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-section" id="who" aria-labelledby="who-title">
        <h2 id="who-title">One platform, three trusted roles.</h2>
        <p>Each role sees only what it needs. Buyer and operator accounts are verified.</p>
        <div className="landing-roles">
          {ROLES.map((role) => (
            <article key={role.title}>
              <h3>{role.title}</h3>
              <p>{role.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <footer className="landing-footer">
        <BrandLogo size={28} />
        <span>
          Market data source: OGD India / AGMARKNET daily reports. Built by CodeFarm · Team 13.
        </span>
      </footer>
    </div>
  );
}
