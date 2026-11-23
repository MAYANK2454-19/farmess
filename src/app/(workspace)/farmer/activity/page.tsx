import { SaleActivityTimeline } from "@/features/activity/sale-activity-timeline";

export default function SaleActivityPage() {
  return (
    <main className="content module-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Selling</p>
          <h1>Sale activity</h1>
          <p className="page-subtitle">
            Follow changes recorded for sales where you are a participant.
          </p>
        </div>
      </div>
      <SaleActivityTimeline />
    </main>
  );
}
