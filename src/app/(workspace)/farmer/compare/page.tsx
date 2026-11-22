import { NetRealisationCalculator } from "@/features/calculations/net-realisation-calculator";

export default function ComparePage() {
  return (
    <main className="content">
      <header className="page-heading">
        <div>
          <p className="eyebrow">Farmess workspace</p>
          <h1>Compare selling options</h1>
          <p className="page-subtitle">
            Start with a transparent net-realisation scenario for one selling option.
          </p>
        </div>
      </header>

      <div className="preview-banner" role="note">
        <span className="banner-dot" />
        <span>
          <strong>Scenario calculator available.</strong> This first slice uses
          the price and costs you enter. Verified market observations and
          buyer offers will be connected separately.
        </span>
      </div>

      <NetRealisationCalculator />
    </main>
  );
}
