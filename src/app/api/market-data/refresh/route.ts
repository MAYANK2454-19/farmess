import { withApiLogging } from "@/lib/observability/logger";
import { NextRequest, NextResponse } from "next/server";
import { getFarmessSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { parseMarketSearchFilters } from "@/lib/market-data/filters";
import { reconcileMarketObservationBatch } from "@/lib/market-data/import-batch";
import { SOURCE_NAME } from "@/lib/market-data/normalize";
import { searchOgdPrices } from "@/lib/market-data/ogd-provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function rupeesToPaise(value: string | null): { value: number | null; valid: boolean } {
  if (value === null) return { value: null, valid: true };
  const rupees = Number(value);
  const paise = Math.round(rupees * 100);
  if (!Number.isFinite(rupees) || rupees < 0 || !Number.isSafeInteger(paise)) {
    return { value: null, valid: false };
  }
  return { value: paise, valid: true };
}

async function handlePOST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return NextResponse.json({ error: "This request could not be verified." }, { status: 403 });
  }

  const session = await getFarmessSession();
  if (!session) {
    return NextResponse.json(
      { error: "Sign in with an authorised data-steward account." },
      { status: 401 },
    );
  }
  if (session.role !== "admin") {
    return NextResponse.json(
      { error: "Only the Farmess data-steward role can import market observations." },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Send optional market filters as JSON." }, { status: 400 });
  }

  const allowed = ["commodity", "state", "district", "market", "limit", "offset"] as const;
  if (
    typeof body !== "object" ||
    body === null ||
    Array.isArray(body) ||
    Object.keys(body).some((key) => !allowed.includes(key as (typeof allowed)[number]))
  ) {
    return NextResponse.json(
      { error: "The import request contains unsupported fields." },
      { status: 400 },
    );
  }

  const params = new URLSearchParams();
  for (const key of ["commodity", "state", "district", "market"] as const) {
    const value = (body as Record<string, unknown>)[key];
    if (value !== undefined && value !== null && value !== "") {
      if (typeof value !== "string" || value.trim().length > 120) {
        return NextResponse.json({ error: `The ${key} filter is invalid.` }, { status: 400 });
      }
      params.set(key, value.trim());
    }
  }

  const limit = (body as Record<string, unknown>).limit;
  if (limit !== undefined) {
    if (typeof limit !== "number" || !Number.isSafeInteger(limit) || limit < 1 || limit > 500) {
      return NextResponse.json(
        { error: "Import limit must be a whole number from 1 to 500." },
        { status: 400 },
      );
    }
    params.set("limit", String(limit));
  }

  const offset = (body as Record<string, unknown>).offset;
  if (offset !== undefined) {
    if (
      typeof offset !== "number" ||
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      offset > 100_000
    ) {
      return NextResponse.json(
        { error: "Import offset must be a whole number from 0 to 100000." },
        { status: 400 },
      );
    }
    params.set("offset", String(offset));
  }

  const filters = parseMarketSearchFilters(params);
  const source = await searchOgdPrices(filters);
  const supabase = await createClient();

  if (source.status === "unavailable" || source.status === "no-data") {
    const { error: auditError } = await supabase.from("market_data_ingestion_runs").insert({
      actor_user_id: session.userId,
      source_name: source.sourceName,
      status: source.status,
      request_filters: filters,
      records_received: source.sourceQuality.received,
      records_upserted: 0,
      error_message: ("message" in source ? source.message : null)?.slice(0, 500) ?? null,
    });

    if (auditError) {
      return NextResponse.json(
        { error: "The source was checked, but the audit record could not be written." },
        { status: 500 },
      );
    }

    return NextResponse.json(
      {
        status: source.status,
        recordsReceived: source.sourceQuality.received,
        recordsAccepted: source.sourceQuality.accepted,
        recordsRejected: source.sourceQuality.rejected,
        sourceQuality: source.sourceQuality,
        recordsUpserted: 0,
        message:
          "message" in source ? source.message : "The source returned no usable observations.",
      },
      { status: source.status === "unavailable" ? 503 : 200 },
    );
  }

  const rows = source.records.map((record) => {
    const min = rupeesToPaise(record.minPrice);
    const max = rupeesToPaise(record.maxPrice);
    const modal = rupeesToPaise(record.modalPrice);
    return {
      valid: min.valid && max.valid && modal.valid,
      row: {
        crop: record.commodity,
        variety: record.variety,
        district: record.district,
        state: record.state,
        market_name: record.market,
        min_price_paise_per_quintal: min.value,
        max_price_paise_per_quintal: max.value,
        modal_price_paise_per_quintal: modal.value,
        observation_date: record.observationDate,
        retrieved_at: record.retrievedAt,
        source_name: SOURCE_NAME,
        source_url: record.sourceUrl,
      },
    };
  });

  if (rows.some((entry) => !entry.valid)) {
    return NextResponse.json(
      { error: "One or more validated prices could not be converted to paise." },
      { status: 422 },
    );
  }

  const batch = reconcileMarketObservationBatch(rows.map((entry) => entry.row));

  if (batch.status === "conflicting-duplicates") {
    const { error: auditError } = await supabase.from("market_data_ingestion_runs").insert({
      actor_user_id: session.userId,
      source_name: source.sourceName,
      status: "partial",
      request_filters: filters,
      records_received: source.sourceQuality.received,
      records_upserted: 0,
      error_message: `Import withheld because ${batch.conflictCount} natural observation key(s) contained conflicting prices or provenance.`,
    });

    if (auditError) {
      return NextResponse.json(
        {
          error:
            "Conflicting source rows were detected, but the audit record could not be written.",
        },
        { status: 500 },
      );
    }

    return NextResponse.json(
      {
        status: "conflict",
        recordsReceived: source.sourceQuality.received,
        recordsAccepted: source.sourceQuality.accepted,
        recordsRejected: source.sourceQuality.rejected,
        sourceQuality: source.sourceQuality,
        recordsUpserted: 0,
        message:
          "The source response repeated an observation key with different values. No observations were imported.",
      },
      { status: 422 },
    );
  }

  const observations = batch.rows;

  const { error: upsertError } = await supabase.from("market_observations").upsert(observations, {
    onConflict: "crop,variety,state,district,market_name,observation_date,source_name",
    ignoreDuplicates: false,
  });

  const auditStatus = upsertError ? "partial" : source.status;
  const { error: auditError } = await supabase.from("market_data_ingestion_runs").insert({
    actor_user_id: session.userId,
    source_name: source.sourceName,
    status: auditStatus,
    request_filters: filters,
    records_received: source.sourceQuality.received,
    records_upserted: upsertError ? 0 : observations.length,
    error_message: upsertError
      ? "Validated observations were not saved. Review the database import error."
      : "message" in source
        ? source.message.slice(0, 500)
        : null,
  });

  if (upsertError || auditError) {
    return NextResponse.json(
      {
        error:
          "The import could not be completed and audited. No successful import is being reported.",
      },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      status: source.status,
      recordsReceived: source.sourceQuality.received,
      recordsAccepted: source.sourceQuality.accepted,
      recordsRejected: source.sourceQuality.rejected,
      sourceQuality: source.sourceQuality,
      recordsUpserted: observations.length,
      duplicatesRemoved: batch.duplicatesRemoved,
      retrievedAt: source.retrievedAt,
      message:
        source.status === "stale"
          ? "Historical observations were stored with their source dates. The source is stale and must not be presented as real-time."
          : "Validated source observations were stored. Prices retain their observation dates and provenance.",
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export const POST = withApiLogging("/api/market-data/refresh", "POST", handlePOST);
