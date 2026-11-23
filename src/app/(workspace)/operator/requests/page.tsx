import { OperatorRequestManager } from "@/features/operators/operator-request-manager";

export default function OperatorRequestsPage() {
  return (
    <main className="content">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Service provider</p>
          <h1>Incoming requests</h1>
          <p className="page-subtitle">
            Review the route, requested quantity and date before accepting or declining a request.
          </p>
        </div>
      </div>
      <OperatorRequestManager />
    </main>
  );
}
