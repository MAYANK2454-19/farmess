import Link from "next/link";
import { Icon } from "@/components/icons";

export default function FarmerOverviewPage() {
  return (
    <main className="content farm-overview">
      <section className="overview-intro" aria-labelledby="overview-title">
        <div>
          <p className="eyebrow">Farmer workspace</p>
          <h1 id="overview-title">Your next sale starts here.</h1>
          <p className="overview-lede">
            Keep a clear record of what you have, check reported market prices and understand the
            costs behind each selling decision.
          </p>
        </div>
        <Link href="/farmer/produce/new" className="button button-primary">
          <Icon name="plus" size={16} />
          Add a produce lot
        </Link>
      </section>

      <div className="overview-columns">
        <section className="overview-section" aria-labelledby="produce-heading">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Your inventory</p>
              <h2 id="produce-heading">Produce lots</h2>
              <p>Lots you add will be listed here.</p>
            </div>
            <Link href="/farmer/produce" className="text-link">
              View all lots
            </Link>
          </div>

          <div className="overview-empty">
            <span className="overview-empty-number" aria-hidden="true">
              01
            </span>
            <div>
              <h3>No produce recorded yet</h3>
              <p>
                Start with one lot. Add the crop, quantity, grade, collection area and the date you
                need to sell by. You can review the details before submitting.
              </p>
              <Link href="/farmer/produce/new">Record your first lot <span aria-hidden="true">→</span></Link>
            </div>
          </div>
        </section>

        <aside className="overview-aside" aria-labelledby="steps-heading">
          <p className="aside-kicker">A practical order</p>
          <h2 id="steps-heading">Plan before you sell.</h2>
          <ol className="step-list">
            <li>
              <div>
                <strong>Record your produce</strong>
                <p>Note the quantity, quality and when it will be ready.</p>
              </div>
            </li>
            <li>
              <div>
                <strong>Check nearby markets</strong>
                <p>Compare dated mandi reports, not unverified price promises.</p>
              </div>
            </li>
            <li>
              <div>
                <strong>Work out your net return</strong>
                <p>Include transport, handling and other costs before deciding.</p>
              </div>
            </li>
          </ol>
        </aside>
      </div>

      <section className="overview-tools" aria-labelledby="tools-heading">
        <p className="eyebrow">Available tools</p>
        <h2 id="tools-heading">Useful for your next decision</h2>
        <p className="overview-tools-intro">
          Start with the information currently available in Farmess.
        </p>
        <div className="tool-links">
          <Link href="/farmer/markets" className="tool-link">
            <strong>Market prices</strong>
            <span>View reported prices with their market, observation date and source.</span>
            <em>Explore market reports →</em>
          </Link>
          <Link href="/farmer/compare" className="tool-link">
            <strong>Net return calculator</strong>
            <span>Enter a selling rate and the costs you expect to pay.</span>
            <em>Calculate a scenario →</em>
          </Link>
          <Link href="/farmer/produce" className="tool-link">
            <strong>Produce records</strong>
            <span>Review the produce details you have entered.</span>
            <em>Open your produce →</em>
          </Link>
        </div>
      </section>

      <p className="preview-footnote">
        Preview mode: sign-in and saved produce records are being connected. Do not use this preview
        as a record of a completed sale.
      </p>
    </main>
  );
}
