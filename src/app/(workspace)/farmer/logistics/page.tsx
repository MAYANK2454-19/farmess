import { ServiceRequestBoard } from "@/features/logistics/service-request-board";

export default function LogisticsPage() {
  return (
    <main className="content">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Moving and storing produce</p>
          <h1>Transport and storage</h1>
          <p className="page-subtitle">
            Review active service listings and send a request using the details that matter for your produce.
          </p>
        </div>
      </div>
      <ServiceRequestBoard />
    </main>
  );
}
