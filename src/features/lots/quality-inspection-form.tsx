"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { QUALITY_CHECKS, type QualityCheck, type QualityCheckResult } from "./quality-inspection";

const CHECK_LABELS: Record<QualityCheck, string> = {
  appearance: "Appearance and maturity",
  physical_damage: "Physical damage",
  pest_or_contamination: "Pest or contamination",
  moisture_condition: "Moisture condition",
  packaging_condition: "Packaging condition",
  temperature_handling: "Temperature handling",
};
type CheckState = Partial<Record<QualityCheck, QualityCheckResult>>;

export function QualityInspectionForm({ lotId }: { lotId: string }) {
  const router = useRouter();
  const [checks, setChecks] = useState<CheckState>({});
  const [observations, setObservations] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  function updateCheck(check: QualityCheck, value: string) {
    setChecks((current) => {
      const next = { ...current };
      if (value === "") delete next[check];
      else next[check] = value as QualityCheckResult;
      return next;
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/produce-lots/${lotId}/quality-inspections`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ checks, observations }),
      });
      const result = (await response.json()) as { error?: string; fields?: string[] };
      if (!response.ok) throw new Error([result.error, ...(result.fields ?? [])].filter(Boolean).join(" "));
      setChecks({});
      setObservations("");
      setMessage("Inspection saved to this lot's private history.");
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Inspection could not be saved.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="panel" onSubmit={submit}>
      <div className="panel-header">
        <div>
          <h2 className="panel-title">New quality observation</h2>
          <p className="panel-caption">Record what you can observe. Leave unknown checks unselected.</p>
        </div>
      </div>
      <div className="form-grid">
        {QUALITY_CHECKS.map((check) => (
          <label className="form-field" key={check}>
            <span className="form-label">{CHECK_LABELS[check]}</span>
            <select className="form-control" value={checks[check] ?? ""} onChange={(event) => updateCheck(check, event.target.value)}>
              <option value="">Not recorded</option>
              <option value="acceptable">No visible issue</option>
              <option value="issue_found">Issue observed</option>
              <option value="not_assessed">Not assessed</option>
            </select>
          </label>
        ))}
        <label className="form-field full">
          <span className="form-label">Inspection notes (optional)</span>
          <textarea className="form-control" value={observations} onChange={(event) => setObservations(event.target.value)}
            maxLength={1000} rows={4} placeholder="Describe visible observations, handling or packaging details." />
          <span className="form-help">{observations.length}/1,000 characters</span>
        </label>
      </div>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {message ? <p className="form-success" role="status">{message}</p> : null}
      <div className="form-footer">
        <p className="form-warning">This is a farmer-entered observation, not a certified grade or food-safety result.</p>
        <button className="button button-primary" type="submit" disabled={pending}>{pending ? "Saving…" : "Save inspection"}</button>
      </div>
    </form>
  );
}
