import Link from "next/link";
import { getFarmessSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export default async function BuyerOverviewPage() {
  const session = await getFarmessSession();
  const supabase = await createClient();

  const [requirements, offers] = session
    ? await Promise.all([
        supabase.from("buyer_requirements").select("id,status").eq("buyer_id", session.userId),
        supabase.from("offers").select("id,status").eq("buyer_id", session.userId),
      ])
    : [
        { data: null, error: new Error("No active session") },
        { data: null, error: new Error("No active session") },
      ];

  return (
    <main className="content">
      <section className="overview-intro">
        <div>
          <p className="eyebrow">Buyer workspace</p>
          <h1>Source with clearer terms.</h1>
          <p className="overview-lede">
            Record the produce you need, review available lots and keep each offer tied to an agreed
            quantity and rate.
          </p>
        </div>
        <Link href="/buyer/requirements" className="button button-primary">
          Create a requirement
        </Link>
      </section>

      <div className="buyer-overview-sections">
        <section className="overview-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Your sourcing needs</p>
              <h2>Buying requirements</h2>
              <p>
                {requirements.error
                  ? "Unable to load requirements"
                  : `${requirements.data?.length ?? 0} saved requirement(s)`}
              </p>
            </div>
            <Link href="/buyer/requirements" className="text-link">
              Manage requirements
            </Link>
          </div>
          <p className="overview-lede">
            Requirements are stored under your buyer account and can be paused or closed when your
            sourcing needs change.
          </p>
        </section>
        <section className="overview-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Offers made</p>
              <h2>My offers</h2>
              <p>
                {offers.error
                  ? "Unable to load offers"
                  : `${offers.data?.length ?? 0} offer(s) sent`}
              </p>
            </div>
            <Link href="/buyer/offers" className="text-link">
              View offers
            </Link>
          </div>
          <p className="overview-lede">
            Track pending offers, withdrawals and farmer decisions. Offers are not sales until
            accepted.
          </p>
        </section>
      </div>

      <section className="overview-tools">
        <p className="eyebrow">Marketplace</p>
        <h2>Browse produce records</h2>
        <p className="overview-tools-intro">
          Only published farmer lots can receive offers. Draft records remain private to their
          owners.
        </p>
        <div className="tool-links">
          <Link href="/buyer/marketplace" className="tool-link">
            <strong>Browse available lots</strong>
            <span>See current published produce with its listed quantity and sell-by date.</span>
            <em>Open marketplace →</em>
          </Link>
          <Link href="/buyer/requirements" className="tool-link">
            <strong>Post a requirement</strong>
            <span>Set your crop, quantity and delivery area.</span>
            <em>Manage requirements →</em>
          </Link>
          <Link href="/buyer/offers" className="tool-link">
            <strong>Offer history</strong>
            <span>Review the terms and status of offers you have sent.</span>
            <em>Review offers →</em>
          </Link>
        </div>
      </section>
    </main>
  );
}
