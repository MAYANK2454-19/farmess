import { AdminHistoryImport } from "@/features/admin/admin-history-import";
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
          <p className="admin-eyebrow">Prices</p>
          <h1>Mandi price imports</h1>
          <p>
            Bring real government mandi prices into Farmess: past prices for trends and forecasts,
            or today&apos;s prices for a quick check. Every import is listed at the bottom.
          </p>
        </div>
      </div>
      {error ? (
        <p className="admin-error" role="alert">
          Import history could not be loaded. Check the admin RLS policy.
        </p>
      ) : null}
      <AdminHistoryImport />
      <AdminMarketImport
        runs={data ?? []}
        apiKeyConfigured={Boolean(process.env.DATA_GOV_IN_API_KEY?.trim())}
      />
    </main>
  );
}
