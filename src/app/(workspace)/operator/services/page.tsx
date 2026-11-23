import { OperatorServiceManager } from "@/features/operators/operator-service-manager";

export default function OperatorServicesPage() {
  return (
    <main className="content">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Service provider</p>
          <h1>Your services</h1>
          <p className="page-subtitle">
            Publish transport or storage capacity, describe its coverage and keep availability up to
            date.
          </p>
        </div>
      </div>
      <OperatorServiceManager />
    </main>
  );
}
