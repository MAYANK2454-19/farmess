import { withApiLogging } from "@/lib/observability/logger";
import { NextResponse, type NextRequest } from "next/server";
import { getFarmessSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { canonicalDistrict, canonicalState, ogdStateName } from "@/lib/location/india";
import { reconcileMarketObservationHistory } from "@/lib/market-data/import-batch";
import { normalizeOgdResponseWithDiagnostics, SOURCE_NAME } from "@/lib/market-data/normalize";
import {
  fetchOgdHistory,
  historyDateToIso,
  OGD_HISTORY_RESOURCE_URL,
} from "@/lib/market-data/ogd-history";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const ALLOWED_DAYS = [30, 90, 180, 365] as const;
const MAX_RECORDS = 20_000;
const TIME_BUDGET_MS = 240_000;
const UPSERT_CHUNK = 500;

function rupeesToPaise(value: string | null): number | null | undefined {
  if (value === null) return null;
  const paise = Math.round(Number(value) * 100);
  return Number.isSafeInteger(paise) && paise >= 0 ? paise : undefined;
}

function text(body: Record<string, unknown>, key: string, required: boolean) {
  const value = body[key];
  if (value === undefined || value === null || value === "") {
    return required ? { error: `Choose a ${key}.` } : { value: undefined };
  }
  if (typeof value !== "string" || value.trim().length === 0 || value.trim().length > 120) {
    return { error: `The ${key} is invalid.` };
  }
  return { value: value.trim() };
}

async function handlePOST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return NextResponse.json({ error: "This request could not be verified." }, { status: 403 });
  }
  const session = await getFarmessSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in with an admin account." }, { status: 401 });
  }
  if (session.role !== "admin") {
    return NextResponse.json(
      { error: "Only a Farmess admin can import past mandi prices." },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Send the import request as JSON." }, { status: 400 });
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return NextResponse.json({ error: "Send the import request as JSON." }, { status: 400 });
  }
  const fields = body as Record<string, unknown>;
  const allowed = ["commodity", "state", "district", "market", "days"];
  if (Object.keys(fields).some((key) => !allowed.includes(key))) {
    return NextResponse.json(
      { error: "The import request contains unsupported fields." },
      { status: 400 },
    );
  }

  const commodity = text(fields, "commodity", true);
  const state = text(fields, "state", true);
  const district = text(fields, "district", false);
  const market = text(fields, "market", false);
  for (const field of [commodity, state, district, market]) {
    if ("error" in field) return NextResponse.json({ error: field.error }, { status: 400 });
  }
  const days = (fields.days ?? 90) as number;
  if (!ALLOWED_DAYS.includes(days as (typeof ALLOWED_DAYS)[number])) {
    return NextResponse.json(
      { error: "Choose how far back to import: 30, 90, 180 or 365 days." },
      { status: 400 },
    );
  }

  const apiKey = process.env.DATA_GOV_IN_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { error: "The data.gov.in API key is not configured on the server." },
      { status: 503 },
    );
  }

  const canonical = canonicalState(state.value!) ?? state.value!;
  const sourceState = ogdStateName(canonical);
  const sourceDistrict = district.value
    ? (canonicalDistrict(canonical, district.value) ?? district.value)
    : undefined;
  const startedAt = Date.now();
  const fromDate = new Date(startedAt - days * 86_400_000).toISOString().slice(0, 10);
  const filters = {
    kind: "history",
    commodity: commodity.value,
    state: sourceState,
    district: sourceDistrict ?? null,
    market: market.value ?? null,
    days,
  };

  const supabase = await createClient();

  // Rows already saved by earlier history imports for the same filters. A re-run
  // first tops up days newer than those, then continues further back from where
  // the earlier run stopped instead of fetching the same newest pages again.
  let savedQuery = supabase
    .from("market_observations")
    .select("observation_date", { count: "exact" })
    .ilike("crop", commodity.value!)
    .ilike("state", sourceState)
    .eq("source_url", OGD_HISTORY_RESOURCE_URL)
    .gte("observation_date", fromDate);
  if (sourceDistrict) savedQuery = savedQuery.ilike("district", sourceDistrict);
  if (market.value) savedQuery = savedQuery.ilike("market_name", market.value);
  const { data: newestRows, count: savedBefore } = await savedQuery
    .order("observation_date", { ascending: false })
    .limit(1);
  const newestSaved = (newestRows?.[0] as { observation_date?: string } | undefined)
    ?.observation_date;

  const base = {
    apiKey,
    commodity: commodity.value!,
    state: sourceState,
    district: sourceDistrict,
    market: market.value,
    maxRecords: MAX_RECORDS,
    deadline: startedAt + TIME_BUDGET_MS,
  };
  let history = await fetchOgdHistory({ ...base, fromDate: newestSaved ?? fromDate });
  if (
    newestSaved &&
    (savedBefore ?? 0) > 0 &&
    (history.stopReason === "reached_start_date" || history.stopReason === "no_more_records")
  ) {
    const fresh = history.records.filter(
      (record) => (historyDateToIso(record.arrival_date) ?? "") > newestSaved,
    ).length;
    const older = await fetchOgdHistory({
      ...base,
      fromDate,
      startOffset: (savedBefore ?? 0) + fresh,
      maxRecords: Math.max(1, MAX_RECORDS - history.records.length),
    });
    const dates = [history.oldestDate, older.oldestDate, history.newestDate, older.newestDate]
      .filter((value): value is string => Boolean(value))
      .sort();
    history = {
      records: [...history.records, ...older.records],
      requests: history.requests + older.requests,
      pageSize: history.pageSize ?? older.pageSize,
      oldestDate: dates[0] ?? null,
      newestDate: dates[dates.length - 1] ?? null,
      stopReason: older.stopReason,
      ...(older.errorMessage ? { errorMessage: older.errorMessage } : {}),
    };
  }

  const retrievedAt = new Date().toISOString();
  const normalized = normalizeOgdResponseWithDiagnostics({ records: history.records }, retrievedAt);
  const today = retrievedAt.slice(0, 10);
  const rows = normalized.records
    .filter((record) => record.observationDate <= today)
    .flatMap((record) => {
      const min = rupeesToPaise(record.minPrice);
      const max = rupeesToPaise(record.maxPrice);
      const modal = rupeesToPaise(record.modalPrice);
      if (min === undefined || max === undefined || modal === undefined) return [];
      return [
        {
          crop: record.commodity,
          variety: record.variety,
          district: record.district,
          state: record.state,
          market_name: record.market,
          min_price_paise_per_quintal: min,
          max_price_paise_per_quintal: max,
          modal_price_paise_per_quintal: modal,
          observation_date: record.observationDate,
          retrieved_at: retrievedAt,
          source_name: SOURCE_NAME,
          source_url: OGD_HISTORY_RESOURCE_URL,
        },
      ];
    });
  const batch = reconcileMarketObservationHistory(rows);

  let saved = 0;
  let saveError = false;
  for (let i = 0; i < batch.rows.length; i += UPSERT_CHUNK) {
    const chunk = batch.rows.slice(i, i + UPSERT_CHUNK);
    const { error } = await supabase.from("market_observations").upsert(chunk, {
      onConflict: "crop,variety,state,district,market_name,observation_date,source_name",
      ignoreDuplicates: false,
    });
    if (error) {
      saveError = true;
      break;
    }
    saved += chunk.length;
  }

  const complete =
    history.stopReason === "reached_start_date" || history.stopReason === "no_more_records";
  const status = saveError
    ? "partial"
    : saved === 0
      ? history.stopReason === "source_error" || history.stopReason === "rate_limited"
        ? "unavailable"
        : "no-data"
      : complete
        ? "stale"
        : "partial";
  const note =
    history.errorMessage ??
    (history.stopReason === "time_limit"
      ? "Stopped at the time limit; run again to continue further back."
      : history.stopReason === "max_records"
        ? `Stopped at ${MAX_RECORDS} records.`
        : null);

  const { error: auditError } = await supabase.from("market_data_ingestion_runs").insert({
    actor_user_id: session.userId,
    source_name: `${SOURCE_NAME} (history)`,
    status,
    request_filters: filters,
    records_received: normalized.quality.received,
    records_upserted: saved,
    error_message: saveError ? "Some rows could not be saved to the database." : note,
  });

  if (saveError || auditError) {
    return NextResponse.json(
      {
        error: saveError
          ? `Saved ${saved} rows, then the database rejected a batch. Nothing after that was saved.`
          : "Prices were saved but the import audit could not be written.",
        recordsUpserted: saved,
      },
      { status: 500 },
    );
  }

  const coverage =
    history.oldestDate && history.newestDate
      ? `${history.oldestDate} to ${history.newestDate}`
      : "no dates";
  return NextResponse.json(
    {
      status,
      stopReason: history.stopReason,
      requests: history.requests,
      sourcePageSize: history.pageSize,
      oldestDate: history.oldestDate,
      newestDate: history.newestDate,
      recordsReceived: normalized.quality.received,
      recordsAccepted: normalized.quality.accepted,
      recordsRejected: normalized.quality.rejected,
      duplicatesRemoved: batch.duplicatesRemoved,
      conflictingKeysWithheld: batch.conflictingKeysWithheld,
      recordsUpserted: saved,
      message:
        saved === 0
          ? (note ??
            ((savedBefore ?? 0) > 0
              ? `Already up to date: ${savedBefore} reports for this period were saved earlier.`
              : "data.gov.in returned no past prices for these filters."))
          : `Saved ${saved} real mandi reports (${coverage}).${note ? ` ${note}` : ""}`,
    },
    {
      status: status === "unavailable" ? 503 : 200,
      headers: { "Cache-Control": "private, no-store" },
    },
  );
}

export const POST = withApiLogging("/api/admin/market-history", "POST", handlePOST);
