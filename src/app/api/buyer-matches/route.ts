import { NextResponse } from "next/server";
import { getFarmessSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import {
  matchProduceLot,
  type BuyerRequirementForMatching,
  type ProduceLotForMatching,
} from "@/features/marketplace/domain";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getFarmessSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in to view requirement matches." }, { status: 401 });
  }
  if (session.role !== "buyer") {
    return NextResponse.json({ error: "Requirement matching is available to buyer accounts." }, { status: 403 });
  }

  const supabase = await createClient();
  const [requirementsResult, lotsResult] = await Promise.all([
    supabase
      .from("buyer_requirements")
      .select("id,crop,variety,grade,market_area,min_quantity,max_quantity,unit,target_price_paise_per_quintal,delivery_by,status,created_at")
      .eq("buyer_id", session.userId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("buyer_marketplace_lots")
      .select("id,crop,variety,grade,quantity,unit,approximate_area,available_from,sell_by,created_at")
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  if (requirementsResult.error || lotsResult.error) {
    return NextResponse.json({ error: "Buyer requirements or published lots could not be loaded." }, { status: 503 });
  }

  const requirements: BuyerRequirementForMatching[] = (requirementsResult.data ?? []).map((item) => ({
    id: item.id,
    crop: item.crop,
    variety: item.variety,
    grade: item.grade,
    quantity: item.min_quantity,
    unit: item.unit as BuyerRequirementForMatching["unit"],
    locationArea: item.market_area,
    requiredAt: item.delivery_by,
  }));

  const lots: ProduceLotForMatching[] = (lotsResult.data ?? []).flatMap((item) => {
    const supportedUnit =
      item.unit === "kg" || item.unit === "quintal" || item.unit === "tonne";
    if (
      !item.id ||
      !item.crop ||
      !Number.isFinite(item.quantity) ||
      item.quantity === null ||
      item.quantity <= 0 ||
      !supportedUnit ||
      !item.available_from
    ) {
      return [];
    }

    return [{
      id: item.id,
      crop: item.crop,
      variety: item.variety,
      grade: item.grade,
      quantity: item.quantity,
      unit: item.unit as ProduceLotForMatching["unit"],
      locationArea: item.approximate_area,
      availableAt: item.available_from,
      sellBy: item.sell_by,
      status: "published" as const,
    }];
  });

  const matches = requirements.map((requirement) => {
    const ranked = lots
      .map((lot) => {
        const match = matchProduceLot(lot, requirement);
        const score =
          match.status === "match" ? 100 : match.status === "partial" ? 60 : 0;
        return {
          lot,
          match,
          score,
        };
      })
      .sort((a, b) => {
        const rank = (status: string) => (status === "match" ? 0 : status === "partial" ? 1 : 2);
        return rank(a.match.status) - rank(b.match.status) || b.score - a.score;
      });

    return {
      requirementId: requirement.id,
      crop: requirement.crop,
      marketArea: requirement.locationArea,
      minQuantity: requirement.quantity,
      unit: requirement.unit,
      deliveryBy: requirement.requiredAt || null,
      results: ranked,
    };
  });

  return NextResponse.json(
    {
      matches,
      metadata: {
        method: "deterministic-rule-match",
        version: "buyer-lot-match-v1",
        scoreMeaning: "Rule coverage only; not a probability of a sale or guarantee of supply.",
        locationMeaning: "Locality is compared by exact text because a farmer has not supplied a shareable map pin for the lot.",
        priceMeaning: "No lot asking price is recorded, so price fit is not scored.",
      },
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
