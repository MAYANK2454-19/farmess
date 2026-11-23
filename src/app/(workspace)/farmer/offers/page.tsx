import { OfferInbox } from "@/features/offers/offer-inbox";

export default function BuyerOffersPage() {
  return (
    <main className="content module-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Selling</p>
          <h1>Buyer offers</h1>
          <p className="page-subtitle">
            Review the price, quantity and validity period of offers received for your produce.
          </p>
        </div>
      </div>
      <OfferInbox />
    </main>
  );
}
