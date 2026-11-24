import { BuyerOfferHistory } from "@/features/buyers/buyer-offer-history";

export default function BuyerOffersPage() {
  return (
    <main className="content">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Sourcing</p>
          <h1>My offers</h1>
          <p className="page-subtitle">
            Track the offers you have sent and withdraw an offer while it is still pending.
          </p>
        </div>
      </div>
      <BuyerOfferHistory />
    </main>
  );
}
