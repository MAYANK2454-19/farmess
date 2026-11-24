import { BuyerMatchResults } from "@/features/buyers/buyer-match-results";

export default function BuyerMatchesPage() {
  return (
    <main className="content">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Sourcing decisions</p>
          <h1>Matches for my requirements</h1>
          <p className="page-subtitle">
            Compare your active crop, quantity, locality and delivery requirements with currently
            published farmer lots.
          </p>
        </div>
      </div>
      <BuyerMatchResults />
    </main>
  );
}
