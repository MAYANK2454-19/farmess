import { AdminMarketImport } from "@/features/admin/admin-market-import";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AdminMarketDataPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("market_data_ingestion_runs")
    .select(
      "id,source_name,status,request_filters,records_received,records_upserted,error_message,started_at,completed_at",
    )
    .order("started_at", { ascending: false })
    .limit(25);

  return (
    <main className="admin-content">
      <div className="admin-page-heading">
        <div>
          <p className="admin-eyebrow">Source pipeline</p>
          <h1>Market-data imports</h1>
          <p>
            Run verified source imports and inspect exactly what was received, excluded and saved.
          </p>
        </div>
      </div>
      {error ? (
        <p className="admin-error" role="alert">
          Import history could not be loaded. Check the admin RLS policy.
        </p>
      ) : null}
      <AdminMarketImport
        runs={data ?? []}
        apiKeyConfigured={Boolean(process.env.DATA_GOV_IN_API_KEY?.trim())}
      />
    </main>
  );
}
