import { withApiLogging } from "@/lib/observability/logger";
import { NextRequest, NextResponse } from "next/server";
import { getFarmessSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import {
  compareNetRealisationOptions,
  type ComparisonOptionInput,
} from "@/features/comparison/net-realisation-comparison";
import type { DeductionField, QuantityUnit } from "@/features/calculations/net-realisation";

export const dynamic = "force-dynamic";

const DEDUCTION_KEYS: readonly DeductionField[] = [
  "transportCost",
  "handlingPackagingCost",
  "marketCharges",
  "storageCost",
  "expectedQualityLoss",
  "otherDeductions",
];

const FRESH_OBSERVATION_DAYS = 7;
const MAX_MARKETS = 8;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toPaisePerLotUnit(paisePerQuintal: number, unit: QuantityUnit): bigint {
  const paise = BigInt(paisePerQuintal);
  if (unit === "quintal") return paise;
  if (unit === "tonne") return paise * 10n;
  // One quintal is 100 kg. Round to the nearest paise per kg.
  return (paise + 50n) / 100n;
}

function formatPaise(paise: bigint): string {
  const rupees = paise / 100n;
  const fraction = (paise % 100n).toString().padStart(2, "0");
  return `${rupees.toString()}.${fraction}`;
}

function isStale(observationDate: string, now: Date): boolean {
  const observed = new Date(`${observationDate}T00:00:00.000Z`);
  if (Number.isNaN(observed.getTime())) return true;
  const ageMs = now.getTime() - observed.getTime();
  return ageMs < -24 * 60 * 60 * 1000 || ageMs > FRESH_OBSERVATION_DAYS * 24 * 60 * 60 * 1000;
}

async function getOwnLot(
  supabase: Awaited<ReturnType<typeof createClient>>,
  lotId: string,
  ownerId: string,
) {
  return supabase
    .from("produce_lots")
    .select("id,crop,quantity,unit,approximate_area,available_from,sell_by,status")
    .eq("id", lotId)
    .eq("owner_id", ownerId)
    .maybeSingle();
}

async function getMarketObservations(
  supabase: Awaited<ReturnType<typeof createClient>>,
  crop: string,
) {
  return supabase
    .from("market_observations")
    .select(
      "id,crop,variety,state,district,market_name,min_price_paise_per_quintal,max_price_paise_per_quintal,modal_price_paise_per_quintal,observation_date,retrieved_at,source_name,source_url",
    )
    .eq("crop", crop)
    .not("modal_price_paise_per_quintal", "is", null)
    .order("observation_date", { ascending: false })
    .limit(200);
}

async function handleGET(request: NextRequest) {
  const session = await getFarmessSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in to compare market net returns." }, { status: 401 });
  }
  if (session.role !== "farmer") {
    return NextResponse.json(
      { error: "Market decision support is available to farmer accounts." },
      { status: 403 },
    );
  }

  const lotId = request.nextUrl.searchParams.get("lotId");
  if (
    !lotId ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(lotId)
  ) {
    return NextResponse.json({ error: "Choose one of your saved produce lots." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: lot, error: lotError } = await getOwnLot(supabase, lotId, session.userId);
  if (lotError || !lot) {
    return NextResponse.json(
      { error: "The selected produce lot could not be found in your account." },
      { status: 404 },
    );
  }

  const { data: observations, error: observationError } = await getMarketObservations(
    supabase,
    lot.crop,
  );
  if (observationError) {
    return NextResponse.json(
      { error: "Source-backed market observations could not be loaded." },
      { status: 503 },
    );
  }

  const latestByMarket = new Map<string, (typeof observations)[number]>();
  for (const observation of observations ?? []) {
    const key = [
      observation.market_name,
      observation.district ?? "",
      observation.state ?? "",
      observation.source_name,
    ]
      .map((part) => part.trim().toLocaleLowerCase("en-IN"))
      .join("|");
    if (!latestByMarket.has(key)) latestByMarket.set(key, observation);
  }

  const now = new Date();
  const unit = lot.unit as QuantityUnit;
  const marketOptions = [...latestByMarket.values()].slice(0, MAX_MARKETS).map((observation) => {
    const paise = toPaisePerLotUnit(observation.modal_price_paise_per_quintal as number, unit);
    const stale = isStale(observation.observation_date, now);
    return {
      id: observation.id,
      label: [observation.market_name, observation.district, observation.state]
        .filter(Boolean)
        .join(", "),
      market: observation.market_name,
      district: observation.district,
      state: observation.state,
      modalPricePerUnit: formatPaise(paise),
      modalPricePaisePerQuintal: observation.modal_price_paise_per_quintal,
      observationDate: observation.observation_date,
      retrievedAt: observation.retrieved_at,
      sourceName: observation.source_name,
      sourceUrl: observation.source_url,
      freshness: stale ? "stale" : "fresh",
      priceUnit: `INR/${unit}`,
    };
  });

  return NextResponse.json(
    {
      lot: {
        id: lot.id,
        crop: lot.crop,
        quantity: lot.quantity,
        unit: lot.unit,
        approximateAreaSharedWithBuyers: null,
        availableFrom: lot.available_from,
        sellBy: lot.sell_by,
        status: lot.status,
      },
      marketOptions,
      freshnessRule: `Reports older than ${FRESH_OBSERVATION_DAYS} days are displayed but not ranked as current.`,
      decisionMethod: "source-backed reported modal price minus farmer-entered lot costs",
      message:
        marketOptions.length === 0
          ? "No source-attributed mandi observations are currently stored for this crop. Do not substitute an invented or demo price."
          : "Enter the costs for each market. Farmess will rank only fresh, complete, feasible options for this lot.",
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

async function handlePOST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return NextResponse.json({ error: "This request could not be verified." }, { status: 403 });
  }

  const session = await getFarmessSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in to compare market net returns." }, { status: 401 });
  }
  if (session.role !== "farmer") {
    return NextResponse.json(
      { error: "Market decision support is available to farmer accounts." },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Send the selected lot and cost entries." }, { status: 400 });
  }

  if (
    !isRecord(body) ||
    Object.keys(body).some((key) => key !== "lotId" && key !== "options") ||
    typeof body.lotId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      body.lotId,
    ) ||
    !Array.isArray(body.options) ||
    body.options.length < 2 ||
    body.options.length > MAX_MARKETS
  ) {
    return NextResponse.json(
      { error: "Choose a lot and at least two market options (up to eight)." },
      { status: 400 },
    );
  }

  const optionInputs: { id: string; deductions: Record<DeductionField, string> }[] = [];
  const seen = new Set<string>();
  for (const option of body.options) {
    if (
      !isRecord(option) ||
      Object.keys(option).some((key) => key !== "id" && key !== "deductions") ||
      typeof option.id !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        option.id,
      ) ||
      !isRecord(option.deductions) ||
      Object.keys(option.deductions).some((key) => !DEDUCTION_KEYS.includes(key as DeductionField))
    ) {
      return NextResponse.json(
        { error: "One or more market cost entries are invalid." },
        { status: 400 },
      );
    }
    if (seen.has(option.id)) {
      return NextResponse.json(
        { error: "Each market option can be included only once." },
        { status: 400 },
      );
    }
    seen.add(option.id);

    const deductions = {} as Record<DeductionField, string>;
    for (const key of DEDUCTION_KEYS) {
      const value = option.deductions[key];
      if (typeof value !== "string" || value.trim().length > 18) {
        return NextResponse.json(
          { error: "Enter each market deduction in rupees. Use 0 when there is no cost." },
          { status: 400 },
        );
      }
      deductions[key] = value.trim();
    }
    optionInputs.push({ id: option.id, deductions });
  }

  const supabase = await createClient();
  const { data: lot, error: lotError } = await getOwnLot(supabase, body.lotId, session.userId);
  if (lotError || !lot) {
    return NextResponse.json(
      { error: "The selected produce lot could not be found." },
      { status: 404 },
    );
  }

  const { data: observations, error: observationError } = await supabase
    .from("market_observations")
    .select(
      "id,crop,market_name,district,state,modal_price_paise_per_quintal,observation_date,retrieved_at,source_name,source_url",
    )
    .eq("crop", lot.crop)
    .in(
      "id",
      optionInputs.map((item) => item.id),
    );

  if (observationError || !observations || observations.length !== optionInputs.length) {
    return NextResponse.json(
      { error: "One or more selected market reports are unavailable for this crop." },
      { status: 409 },
    );
  }

  const optionById = new Map(optionInputs.map((item) => [item.id, item]));
  const unit = lot.unit as QuantityUnit;
  const now = new Date();

  const options: ComparisonOptionInput[] = observations.map((observation) => {
    const input = optionById.get(observation.id)!;
    const stale = isStale(observation.observation_date, now);
    const price = toPaisePerLotUnit(observation.modal_price_paise_per_quintal as number, unit);
    const label = [observation.market_name, observation.district, observation.state]
      .filter(Boolean)
      .join(", ");

    return {
      id: observation.id,
      lotId: lot.id,
      label,
      source: "market_observation",
      sourceName: observation.source_name,
      valueType: "reported",
      pricePerUnit: formatPaise(price),
      priceUnit: unit,
      deductions: input.deductions,
      feasibility: stale
        ? {
            status: "infeasible",
            reasons: [
              `Observation dated ${observation.observation_date} is older than ${FRESH_OBSERVATION_DAYS} days and is not ranked as current.`,
            ],
          }
        : { status: "feasible" },
      observationDate: observation.observation_date,
      retrievedAt: observation.retrieved_at,
      sourceUrl: observation.source_url,
    };
  });

  const comparison = compareNetRealisationOptions(
    {
      lotId: lot.id,
      quantity: String(lot.quantity),
      quantityUnit: unit,
      options,
    },
    now,
  );

  return NextResponse.json(
    {
      lot: { id: lot.id, crop: lot.crop, quantity: lot.quantity, unit: lot.unit },
      comparison,
      method: "net-realisation-by-source-reported-modal-price",
      freshnessDays: FRESH_OBSERVATION_DAYS,
      limitation:
        "Transport, handling, market, storage, quality-loss and other deductions are entered by the farmer; Farmess does not invent cost estimates. The ranking is based on straight net arithmetic, not an ML probability.",
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export const GET = withApiLogging("/api/market-decisions", "GET", handleGET);
export const POST = withApiLogging("/api/market-decisions", "POST", handlePOST);
