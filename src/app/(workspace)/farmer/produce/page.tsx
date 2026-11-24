import Link from "next/link";
import { Icon } from "@/components/icons";
import { getFarmessSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { LotStatusButton } from "@/features/lots/lot-status-button";
import { LotReadinessPanel } from "@/features/lots/lot-readiness-panel";

function formatDate(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      }).format(date);
}

function formatQuantity(value: number) {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 3 }).format(value);
}

function formatStatus(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export default async function MyProducePage() {
  const session = await getFarmessSession();
  const supabase = await createClient();

  const { data: lots, error } = session
    ? await supabase
        .from("produce_lots")
        .select(
          "id,crop,variety,grade,quantity,unit,approximate_area,available_from,sell_by,status,created_at",
        )
        .eq("owner_id", session.userId)
        .order("created_at", { ascending: false })
    : { data: null, error: new Error("No active session") };

  return (
    <main className="content">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Your inventory</p>
          <h1>My produce</h1>
          <p className="page-subtitle">
            Keep track of the crop, quantity, quality and collection details for each lot. Drafts
            stay private until you publish them.
          </p>
        </div>
        <Link href="/farmer/produce/new" className="button button-primary">
          <Icon name="plus" size={16} /> Add a produce lot
        </Link>
      </div>

      <p className="preview-footnote">
        Publishing makes crop, grade, quantity, availability and a consented approximate locality
        visible to buyers. Your private notes and contact details are not shown on the marketplace.
        Manage locality sharing in{" "}
        <Link href="/profile" className="text-link">
          Profile & privacy
        </Link>
        .
      </p>

      {!error && lots ? (
        <LotReadinessPanel
          lots={lots.map((lot) => ({
            id: lot.id,
            crop: lot.crop,
            available_from: lot.available_from,
            sell_by: lot.sell_by,
            status: lot.status,
          }))}
          today={new Intl.DateTimeFormat("en-CA", {
            timeZone: "Asia/Kolkata",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          }).format(new Date())}
        />
      ) : null}

      <section className="panel" aria-labelledby="lots-heading">
        <div className="panel-header">
          <div>
            <h2 className="panel-title" id="lots-heading">
              Your produce lots
            </h2>
            <p className="panel-caption">
              {error
                ? "Your saved records could not be loaded."
                : `${lots?.length ?? 0} saved lot(s)`}
            </p>
          </div>
        </div>

        {error ? (
          <div className="empty-state" role="alert">
            <h3 className="empty-title">Unable to load your produce</h3>
            <p className="empty-copy">
              Your records have not been changed. Refresh the page or try again shortly.
            </p>
          </div>
        ) : lots && lots.length > 0 ? (
          <div className="table-wrap">
            <table className="produce-table">
              <thead>
                <tr>
                  <th scope="col">Produce</th>
                  <th scope="col">Quantity</th>
                  <th scope="col">Collection area</th>
                  <th scope="col">Available from</th>
                  <th scope="col">Sell by</th>
                  <th scope="col">Status</th>
                  <th scope="col">Quality checks</th>
                  <th scope="col">Marketplace</th>
                </tr>
              </thead>
              <tbody>
                {lots.map((lot) => (
                  <tr key={lot.id}>
                    <td>
                      <strong>{lot.crop}</strong>
                      <span>
                        {[lot.variety, lot.grade].filter(Boolean).join(" · ") ||
                          "No variety or grade recorded"}
                      </span>
                    </td>
                    <td>
                      <strong>
                        {formatQuantity(lot.quantity)} {lot.unit}
                      </strong>
                    </td>
                    <td>{lot.approximate_area}</td>
                    <td>{formatDate(lot.available_from)}</td>
                    <td>{formatDate(lot.sell_by)}</td>
                    <td>
                      <span className={"produce-status produce-status-" + lot.status}>
                        {formatStatus(lot.status)}
                      </span>
                    </td>
                    <td>
                      <Link href={`/farmer/produce/${lot.id}/quality`} className="text-link">
                        Record / view
                      </Link>
                    </td>
                    <td>
                      <LotStatusButton lotId={lot.id} status={lot.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            <h3 className="empty-title">No produce lots to show</h3>
            <p className="empty-copy">
              Your inventory will appear here after you save a lot. Each record describes produce
              that is actually available, with a clear quantity and collection area.
            </p>
            <Link
              href="/farmer/produce/new"
              className="button button-primary"
              style={{ marginTop: 16 }}
            >
              Add your first lot <Icon name="chevron" size={15} />
            </Link>
          </div>
        )}
      </section>
    </main>
  );
}
