import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { QualityInspectionForm } from "@/features/lots/quality-inspection-form";
import { QUALITY_CHECKS, type QualityCheck } from "@/features/lots/quality-inspection";
import { getFarmessSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

const CHECK_LABELS: Record<QualityCheck, string> = {
  appearance: "Appearance and maturity",
  physical_damage: "Physical damage",
  pest_or_contamination: "Pest or contamination",
  moisture_condition: "Moisture condition",
  packaging_condition: "Packaging condition",
  temperature_handling: "Temperature handling",
};
type PageProps = { params: Promise<{ lotId: string }> };

export default async function ProduceQualityPage({ params }: PageProps) {
  const session = await getFarmessSession();
  if (!session) redirect("/login");
  if (session.role !== "farmer") redirect("/workspace-unavailable");
  const { lotId } = await params;
  const supabase = await createClient();
  const { data: lot, error: lotError } = await supabase
    .from("produce_lots")
    .select("id,crop,variety,grade,quantity,unit")
    .eq("id", lotId)
    .eq("owner_id", session.userId)
    .maybeSingle();
  if (lotError || !lot) notFound();

  const { data: inspections, error: historyError } = await supabase
    .from("produce_quality_inspections")
    .select("id,inspected_at,checks,observations,status,completed_checks,total_checks,issues")
    .eq("lot_id", lotId)
    .eq("owner_id", session.userId)
    .order("inspected_at", { ascending: false });

  return (
    <main className="content module-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Produce quality · Private record</p>
          <h1>{lot.crop} inspection</h1>
          <p className="page-subtitle">
            {[lot.variety, lot.grade, `${lot.quantity} ${lot.unit}`].filter(Boolean).join(" · ")}
          </p>
        </div>
        <Link href="/farmer/produce" className="button button-secondary">
          Back to my produce
        </Link>
      </div>
      <p className="preview-footnote">
        Records are visible only to the owning farmer. They do not certify food safety, assign an
        independent grade or change marketplace publication.
      </p>
      <QualityInspectionForm lotId={lot.id} />
      <section className="panel" aria-labelledby="inspection-history-heading">
        <div className="panel-header">
          <div>
            <h2 className="panel-title" id="inspection-history-heading">
              Inspection history
            </h2>
            <p className="panel-caption">
              {historyError
                ? "History could not be loaded."
                : `${inspections?.length ?? 0} saved observation(s)`}
            </p>
          </div>
        </div>
        {historyError ? (
          <p className="empty-copy" role="alert">
            Your saved records are unchanged. Refresh to try again.
          </p>
        ) : inspections && inspections.length > 0 ? (
          <div className="stack-list">
            {inspections.map((inspection) => (
              <article className="panel panel-muted" key={inspection.id}>
                <div className="panel-header">
                  <div>
                    <h3 className="panel-title">{inspection.status.replaceAll("_", " ")}</h3>
                    <p className="panel-caption">
                      {new Intl.DateTimeFormat("en-IN", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      }).format(new Date(inspection.inspected_at))}
                      {" · "}
                      {inspection.completed_checks}/{inspection.total_checks} checks recorded
                    </p>
                  </div>
                </div>
                {inspection.issues.length > 0 ? (
                  <p className="form-warning">
                    Observed issues:{" "}
                    {inspection.issues
                      .map((item) => CHECK_LABELS[item as QualityCheck] ?? item)
                      .join(", ")}
                  </p>
                ) : null}
                <ul>
                  {QUALITY_CHECKS.map((check) => {
                    const value =
                      (inspection.checks as Partial<Record<QualityCheck, string>>)[check] ??
                      "not recorded";
                    return (
                      <li key={check}>
                        {CHECK_LABELS[check]}: {value.replaceAll("_", " ")}
                      </li>
                    );
                  })}
                </ul>
                {inspection.observations ? <p>{inspection.observations}</p> : null}
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <h3 className="empty-title">No inspection records yet</h3>
            <p className="empty-copy">
              Save the first observation above to start a private history for this lot.
            </p>
          </div>
        )}
      </section>
    </main>
  );
}
