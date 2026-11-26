import { FarmerBuyerDemand } from "@/features/buyers/farmer-buyer-demand";

export default function FarmerBuyerDemandPage() {
  return (
    <main className="content module-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Selling</p>
          <h1>Buyer demand</h1>
          <p className="page-subtitle">
            Buyers looking for what you grow: full matches and partial matches for each of your
            lots, with what fits and what differs.
          </p>
        </div>
      </div>
      <FarmerBuyerDemand />
    </main>
  );
}
