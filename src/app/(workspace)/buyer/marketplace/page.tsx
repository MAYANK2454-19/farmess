import { MarketplaceBoard } from "@/features/buyers/marketplace-board";

export default function BuyerMarketplacePage() {
  return (
    <main className="content">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Sourcing</p>
          <h1>Produce marketplace</h1>
          <p className="page-subtitle">
            Review published farmer lots and make offers with a clear quantity, price and expiry.
          </p>
        </div>
      </div>
      <MarketplaceBoard />
    </main>
  );
}
