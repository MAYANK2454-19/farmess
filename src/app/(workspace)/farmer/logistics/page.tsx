import { LogisticsDiscovery } from "@/features/logistics/logistics-discovery";
import { ServiceRequestBoard } from "@/features/logistics/service-request-board";

export default function LogisticsPage() {
  return (
    <main className="content">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Moving and storing produce</p>
          <h1>Transport and storage</h1>
          <p className="page-subtitle">
            Find mapped provider services near a chosen locality, compare their stated capabilities and request support.
          </p>
        </div>
      </div>
      <LogisticsDiscovery />
      <div className="logistics-directory-divider">
        <p className="eyebrow">Provider directory</p>
        <h2>Browse active listings by service area</h2>
        <p>Listings without published map coordinates remain visible here and can still receive a request.</p>
      </div>
      <ServiceRequestBoard />
    </main>
  );
}
