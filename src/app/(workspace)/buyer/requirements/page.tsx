import { BuyerRequirementsManager } from "@/features/buyers/buyer-requirements-manager";

export default function BuyerRequirementsPage() {
  return (
    <main className="content">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Buying</p>
          <h1>My requirements</h1>
          <p className="page-subtitle">
            Keep your sourcing needs clear: crop, grade, quantity, delivery area and target price.
          </p>
        </div>
      </div>
      <BuyerRequirementsManager />
    </main>
  );
}
