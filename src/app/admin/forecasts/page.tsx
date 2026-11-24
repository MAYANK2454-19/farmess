import {
  AdminForecastConsole,
  type ForecastCandidate,
} from "@/features/admin/admin-forecast-console";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AdminForecastPage() {
  const supabase = await createClient();
  const { data: runs, error: runsError } = await supabase
    .from("market_forecast_runs")
    .select(
      "id,crop,variety,state,district,market_name,horizon_days,model_name,model_version,training_observation_count,validated_observation_count,training_start,training_end,baseline_mae_paise_per_quintal,model_mae_paise_per_quintal,baseline_smape_percent,model_smape_percent,created_at",
    )
    .eq("status", "candidate")
    .order("created_at", { ascending: false })
    .limit(30);

  const ids = (runs ?? []).map((run) => run.id);
  const { data: points, error: pointsError } = ids.length
    ? await supabase
        .from("market_forecast_points")
        .select(
          "forecast_run_id,target_date,predicted_modal_price_paise_per_quintal,lower_bound_paise_per_quintal,upper_bound_paise_per_quintal",
        )
        .in("forecast_run_id", ids)
        .order("target_date", { ascending: true })
    : { data: [], error: null };

  const pointMap = new Map<string, ForecastCandidate["points"]>();
  for (const point of points ?? []) {
    const existing = pointMap.get(point.forecast_run_id) ?? [];
    existing.push({
      target_date: point.target_date,
      predicted_modal_price_paise_per_quintal: Number(
        point.predicted_modal_price_paise_per_quintal,
      ),
      lower_bound_paise_per_quintal:
        point.lower_bound_paise_per_quintal === null
          ? null
          : Number(point.lower_bound_paise_per_quintal),
      upper_bound_paise_per_quintal:
        point.upper_bound_paise_per_quintal === null
          ? null
          : Number(point.upper_bound_paise_per_quintal),
    });
    pointMap.set(point.forecast_run_id, existing);
  }

  const candidates: ForecastCandidate[] = (runs ?? []).map((run) => ({
    ...run,
    validated_observation_count: run.validated_observation_count === null ? null : Number(run.validated_observation_count),
    baseline_mae_paise_per_quintal:
      run.baseline_mae_paise_per_quintal === null
        ? null
        : Number(run.baseline_mae_paise_per_quintal),
    model_mae_paise_per_quintal:
      run.model_mae_paise_per_quintal === null ? null : Number(run.model_mae_paise_per_quintal),
    baseline_smape_percent:
      run.baseline_smape_percent === null ? null : Number(run.baseline_smape_percent),
    model_smape_percent: run.model_smape_percent === null ? null : Number(run.model_smape_percent),
    points: pointMap.get(run.id) ?? [],
  }));

  return (
    <main className="admin-content">
      <div className="admin-page-heading">
        <div>
          <p className="admin-eyebrow">Model governance</p>
          <h1>Forecast review</h1>
          <p>
            Stage offline evaluation files and record a human review before any forecast becomes
            visible.
          </p>
        </div>
      </div>
      {runsError || pointsError ? (
        <p className="admin-error" role="alert">
          Candidate records could not be loaded. Check the admin RLS policy before reviewing
          forecasts.
        </p>
      ) : null}
      <AdminForecastConsole initialCandidates={candidates} />
    </main>
  );
}
