import { SaleActivityTimeline } from "@/features/activity/sale-activity-timeline";
import { SalesBoard } from "@/features/sales/sales-board";

export default function BuyerSalesPage() {
  return (
    <main className="content module-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Buying</p>
          <h1>My purchases</h1>
          <p className="page-subtitle">
            Follow each agreed purchase, confirm when the produce reaches you, then rate the farmer.
          </p>
        </div>
      </div>
      <SalesBoard />
      <SaleActivityTimeline />
    </main>
  );
}
