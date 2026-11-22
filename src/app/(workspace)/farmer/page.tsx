import Link from "next/link";
import { Icon } from "@/components/icons";

export default function FarmerOverviewPage() {
  return (
    <main className="content">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Your workspace</p>
          <h1>Overview</h1>
          <p className="page-subtitle">Keep your produce, market information and selling options in one place.</p>
        </div>
        <Link href="/farmer/produce/new" className="button button-primary"><Icon name="plus" size={16} /> Add produce lot</Link>
      </div>

      <div className="preview-banner" role="status">
        <span className="banner-dot" />
        <span><strong>Build preview.</strong> This is the first application shell. Authentication, saved lots and live market sources are not connected yet.</span>
      </div>

      <section className="overview-grid" aria-label="Workspace summary">
        <article className="summary-card">
          <div className="summary-top"><span className="summary-label">My produce lots</span><span className="summary-symbol"><Icon name="produce" size={16} /></span></div>
          <p className="summary-value">No lots yet</p>
          <p className="summary-helper">Add a lot to start your workspace</p>
        </article>
        <article className="summary-card">
          <div className="summary-top"><span className="summary-label">Buyer offers</span><span className="summary-symbol"><Icon name="offers" size={16} /></span></div>
          <p className="summary-value">Not connected</p>
          <p className="summary-helper">Offers appear when marketplace workflows are ready</p>
        </article>
        <article className="summary-card">
          <div className="summary-top"><span className="summary-label">Market observations</span><span className="summary-symbol"><Icon name="markets" size={16} /></span></div>
          <p className="summary-value">Unavailable</p>
          <p className="summary-helper">No source-backed prices are loaded</p>
        </article>
      </section>

      <div className="dashboard-grid">
        <div className="panel">
          <div className="panel-header">
            <div><h2 className="panel-title">My produce</h2><p className="panel-caption">Your saved lots and their selling status</p></div>
            <Link href="/farmer/produce/new" className="text-link">Add a lot</Link>
          </div>
          <div className="empty-state">
            <span className="empty-icon"><Icon name="leaf" size={23} /></span>
            <h3 className="empty-title">Your produce will appear here</h3>
            <p className="empty-copy">Create a lot with its crop, variety, grade, quantity and sell-by date. You can review the details before anything is shared.</p>
            <Link href="/farmer/produce/new" className="button button-secondary" style={{ marginTop: 16 }}>Create your first lot <Icon name="chevron" size={15} /></Link>
          </div>
        </div>

        <div className="side-stack">
          <section className="panel next-step">
            <div className="next-step-top"><span className="step-number">01</span><h3>Start with your produce</h3></div>
            <p>Farmess compares selling options for a specific produce lot. Add the details first; market and cost information comes next.</p>
            <Link href="/farmer/produce/new" className="button button-primary">Add produce lot <Icon name="chevron" size={15} /></Link>
          </section>
          <section className="data-note">
            <h3>Market prices are not connected yet</h3>
            <p>We will show the source, observation date, unit and freshness beside every reported price. This build does not display invented or illustrative market values.</p>
          </section>
        </div>
      </div>
    </main>
  );
}
