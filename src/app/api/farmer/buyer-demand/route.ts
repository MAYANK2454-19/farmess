import { withApiLogging } from "@/lib/observability/logger";
import { NextResponse } from "next/server";
import { getFarmessSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { QuantityUnit } from "@/features/marketplace/domain";
import { toRatingSummary } from "@/features/ratings/rating";
import {
  matchLotToRequirement,
  type DemandRequirement,
  type SellerLot,
} from "@/features/marketplace/seller-demand";

export const dynamic = "force-dynamic";

const UNITS = new Set(["kg", "quintal", "tonne"]);

/**
 * Active buyer requirements that fully or partly fit each of the farmer's lots.
 * Buyer identity and contact are included only where the buyer has opted in.
 */
async function handleGET() {
  const session = await getFarmessSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in to see buyer demand." }, { status: 401 });
  }
  if (session.role !== "farmer") {
    return NextResponse.json(
      { error: "Buyer demand is available to farmer accounts." },
      { status: 403 },
    );
  }

  const supabase = await createClient();
  const [lotsResult, demandResult] = await Promise.all([
    // Row-level security limits a farmer to their own lots.
    supabase
      .from("produce_lots")
      .select("id,crop,variety,grade,quantity,unit,approximate_area,available_from,sell_by,status")
      .in("status", ["draft", "published"])
      .order("created_at", { ascending: false })
      .limit(50),
    supabase.rpc("farmer_buyer_demand"),
  ]);

  if (lotsResult.error || demandResult.error) {
    return NextResponse.json(
      { error: "Your lots or buyer requirements could not be loaded." },
      { status: 503 },
    );
  }

  const requirements = (demandResult.data ?? []).flatMap((row) =>
    UNITS.has(row.unit)
      ? [
          {
            requirement: {
              id: row.id,
              crop: row.crop,
              variety: row.variety,
              grade: row.grade,
              minQuantity: Number(row.min_quantity),
              maxQuantity: row.max_quantity === null ? null : Number(row.max_quantity),
              unit: row.unit as QuantityUnit,
              marketArea: row.market_area,
              deliveryBy: row.delivery_by,
            } satisfies DemandRequirement,
            buyer: {
              label: row.buyer_label,
              type: row.buyer_type,
              phone: row.buyer_phone,
              email: row.buyer_email,
              rating: toRatingSummary(row.buyer_rating_average, row.buyer_rating_count),
            },
            targetPricePaisePerQuintal: row.target_price_paise_per_quintal,
          },
        ]
      : [],
  );

  const lots = (lotsResult.data ?? []).flatMap((row) => {
    if (!UNITS.has(row.unit)) return [];
    const lot: SellerLot = {
      id: row.id,
      crop: row.crop,
      variety: row.variety,
      grade: row.grade,
      quantity: Number(row.quantity),
      unit: row.unit as QuantityUnit,
      area: row.approximate_area,
      availableFrom: row.available_from,
      sellBy: row.sell_by,
      status: row.status,
    };
    const matches = requirements
      .flatMap((item) => {
        const match = matchLotToRequirement(lot, item.requirement);
        return match
          ? [
              {
                ...match,
                requirement: item.requirement,
                buyer: item.buyer,
                targetPricePaisePerQuintal: item.targetPricePaisePerQuintal,
              },
            ]
          : [];
      })
      .sort(
        (a, b) => Number(b.status === "match") - Number(a.status === "match") || b.score - a.score,
      );
    return [{ lot, matches }];
  });

  return NextResponse.json(
    {
      lots,
      activeRequirements: requirements.length,
      metadata: {
        method: "seller-side rule match",
        meaning:
          "Only the crop must match. Other differences are listed as gaps, so a partial match may still be worth an offer (for example selling part of a requirement).",
      },
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export const GET = withApiLogging("/api/farmer/buyer-demand", "GET", handleGET);
