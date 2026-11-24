import type { Metadata } from "next";
import {
  AdminAccessRequestConsole,
  type AdminAccessRequest,
} from "@/features/access/admin-access-request-console";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Access requests",
};

export default async function AdminAccessRequestsPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("role_access_requests")
    .select(
      "id,requested_role,requester_name,organisation_name,reason,status,review_note,created_at,reviewed_at",
    )
    .order("created_at", { ascending: false })
    .limit(200);

  const requests = (data ?? []) as AdminAccessRequest[];

  return (
    <main className="content admin-content">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Authority levels</p>
          <h1>Access requests</h1>
          <p className="page-subtitle">
            Farmer accounts that asked for buyer or transport &amp; storage access. Approving grants
            the role through an audited admin-only database function; admin access can never be
            requested.
          </p>
        </div>
      </div>
      {error ? (
        <p className="form-alert" role="alert">
          Access requests could not be loaded. Check that the role access migration is applied.
        </p>
      ) : (
        <AdminAccessRequestConsole initialRequests={requests} />
      )}
    </main>
  );
}
