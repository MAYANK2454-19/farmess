import { NetRealisationCalculator } from "@/features/calculations/net-realisation-calculator";

export default function ComparePage() {
  return (
    <main className="content">
      <header className="page-heading">
        <div>
          <p className="eyebrow">Net return</p>
          <h1>Compare selling options</h1>
          <p className="page-subtitle">
            See what you keep after transport, handling, market charges and quality loss — not just
            the headline price.
          </p>
        </div>
      </header>

      <div className="preview-banner" role="note">
        <span className="banner-dot" />
        <span>
          <strong>You stay in control.</strong> The calculation uses the selling rate and costs you
          enter. Unknown costs are flagged as missing, never counted as zero.
        </span>
      </div>

      <NetRealisationCalculator />
    </main>
  );
}
