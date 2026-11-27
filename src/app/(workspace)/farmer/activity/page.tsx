import { SaleActivityTimeline } from "@/features/activity/sale-activity-timeline";
import { SalesBoard } from "@/features/sales/sales-board";

export default function SaleActivityPage() {
  return (
    <main className="content module-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Selling</p>
          <h1>Sales</h1>
          <p className="page-subtitle">
            Take each agreed sale through dispatch, delivery and payment, then rate the buyer.
          </p>
        </div>
      </div>
      <SalesBoard />
      <SaleActivityTimeline />
    </main>
  );
}
