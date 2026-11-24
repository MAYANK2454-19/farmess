import {
  AdminProviderVerificationConsole,
  type AdminProviderListing,
  type ProviderVerificationEvent,
} from "@/features/admin/admin-provider-verification";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AdminProvidersPage() {
  const supabase = await createClient();
  const [listingsResult, eventsResult] = await Promise.all([
    supabase
      .from("service_listings")
      .select(
        "id,operator_id,title,service_type,service_area,destination_area,description,price_paise,rate_basis,capacity_quantity,capacity_unit,available_from,available_until,status,verification_state,created_at,updated_at",
      )
      .neq("verification_state", "platform_verified")
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("service_listing_verification_events")
      .select("id,listing_id,reviewed_by_user_id,previous_state,new_state,review_note,created_at")
      .order("created_at", { ascending: false })
      .limit(30),
  ]);

  const listings: AdminProviderListing[] = (listingsResult.data ?? []).map((item) => ({
    ...item,
    price_paise: item.price_paise === null ? null : Number(item.price_paise),
    capacity_quantity: item.capacity_quantity === null ? null : Number(item.capacity_quantity),
  }));

  const events: ProviderVerificationEvent[] = eventsResult.data ?? [];

  return (
    <main className="admin-content">
      <div className="admin-page-heading">
        <div>
          <p className="admin-eyebrow">Marketplace trust</p>
          <h1>Provider verification</h1>
          <p>
            Review operator transport and storage listings. Decisions are restricted to authorised
            admins and recorded with a required audit note.
          </p>
        </div>
      </div>
      {listingsResult.error || eventsResult.error ? (
        <p className="admin-error" role="alert">
          Provider review data could not be loaded. Apply the provider verification review migration
          and check admin RLS policies.
        </p>
      ) : (
        <AdminProviderVerificationConsole initialListings={listings} initialEvents={events} />
      )}
    </main>
  );
}
