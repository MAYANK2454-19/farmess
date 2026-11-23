import Link from "next/link";

export default function FarmerOverviewPage() {
  return (
    <main className="content farm-overview">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Farmess</p>
          <h1>Your farm</h1>
          <p className="page-subtitle">
            Keep your produce details, market information and selling costs together.
          </p>
        </div>
        <Link href="/farmer/produce/new" className="button button-primary">
          Add produce
        </Link>
      </div>

      <section className="farm-overview-section" aria-labelledby="produce-heading">
        <div className="section-heading">
          <div>
            <h2 id="produce-heading">Your produce</h2>
            <p>Produce lots you have added will appear here.</p>
          </div>
          <Link href="/farmer/produce" className="text-link">
            View all produce
          </Link>
        </div>
        <div className="simple-empty-state">
          <h3>No produce added</h3>
          <p>
            Start with one lot. Add the crop, quantity, grade and the date you need to sell by. You
            can review the details before submitting.
          </p>
          <Link href="/farmer/produce/new" className="text-link">
            Add your first lot
          </Link>
        </div>
      </section>

      <section className="farm-overview-section" aria-labelledby="next-heading">
        <div className="section-heading">
          <div>
            <h2 id="next-heading">What you can do</h2>
            <p>Use the information available to plan your next step.</p>
          </div>
        </div>
        <div className="quick-links">
          <Link href="/farmer/markets" className="quick-link">
            <span className="quick-link-title">Check market prices</span>
            <span className="quick-link-copy">
              View reported mandi prices with their source and observation date.
            </span>
            <span className="quick-link-action">Open market prices</span>
          </Link>
          <Link href="/farmer/compare" className="quick-link">
            <span className="quick-link-title">Work out your net return</span>
            <span className="quick-link-copy">
              Enter a selling rate and the costs you expect to pay.
            </span>
            <span className="quick-link-action">Open calculator</span>
          </Link>
          <Link href="/farmer/produce" className="quick-link">
            <span className="quick-link-title">Manage produce</span>
            <span className="quick-link-copy">Review the produce details you have entered.</span>
            <span className="quick-link-action">View produce</span>
          </Link>
        </div>
      </section>

      <p className="preview-footnote">
        Preview build: sign-in and saved records are not connected. Details entered in forms are not
        stored in an account yet.
      </p>
    </main>
  );
}
