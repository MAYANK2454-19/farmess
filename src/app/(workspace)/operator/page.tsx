import Link from "next/link";
import { getFarmessSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export default async function OperatorOverviewPage() {
  const session = await getFarmessSession();
  const supabase = await createClient();

  const [listings, requests] = session
    ? await Promise.all([
        supabase.from("service_listings").select("id,status").eq("operator_id", session.userId),
        supabase
          .from("service_requests")
          .select("id,status")
          .eq("provider_user_id", session.userId),
      ])
    : [
        { data: null, error: new Error("No active session") },
        { data: null, error: new Error("No active session") },
      ];

  const activeListings = listings.data?.filter((item) => item.status === "active").length ?? 0;
  const pendingRequests = requests.data?.filter((item) => item.status === "pending").length ?? 0;

  return (
    <main className="content">
      <section className="overview-intro">
        <div>
          <p className="eyebrow">Service provider workspace</p>
          <h1>Keep your capacity visible.</h1>
          <p className="overview-lede">
            Manage the transport and storage services you offer, then respond to requests with clear
            availability and terms.
          </p>
        </div>
        <Link href="/operator/services" className="button button-primary">
          Publish a service
        </Link>
      </section>

      <section className="operator-summary" aria-label="Service summary">
        <div>
          <span>Active listings</span>
          <strong>{listings.error ? "—" : activeListings}</strong>
          <Link href="/operator/services">Manage services →</Link>
        </div>
        <div>
          <span>Pending requests</span>
          <strong>{requests.error ? "—" : pendingRequests}</strong>
          <Link href="/operator/requests">Review requests →</Link>
        </div>
      </section>

      <div className="overview-tools">
        <p className="eyebrow">Daily work</p>
        <h2>Keep service information current.</h2>
        <p className="overview-tools-intro">
          Only services you publish as active are visible to farmers and buyers. Pause a listing
          when capacity is full.
        </p>
        <div className="tool-links">
          <Link href="/operator/services" className="tool-link">
            <strong>Service listings</strong>
            <span>Publish, pause, reactivate or close transport and storage listings.</span>
            <em>Manage listings →</em>
          </Link>
          <Link href="/operator/requests" className="tool-link">
            <strong>Incoming requests</strong>
            <span>See the requested route, quantity and date, then record your decision.</span>
            <em>Respond to requests →</em>
          </Link>
        </div>
      </div>
    </main>
  );
}
