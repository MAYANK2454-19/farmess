// Builds api-tests/endpoints.json from public/openapi.json. Run from the farmess folder: node api-tests/build_endpoints.mjs
import fs from "node:fs";
const spec = JSON.parse(fs.readFileSync("public/openapi.json", "utf8"));

const SAMPLE_ID = "00000000-0000-4000-8000-000000000000";
const today = new Date();
const day = (offset) => {
  const d = new Date(today);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};

const QUERY = {
  "GET /api/market-prices": { commodity: "Tomato", state: "Jammu and Kashmir", limit: "5" },
  "GET /api/market-forecasts": { crop: "Tomato", state: "Maharashtra" },
  "GET /api/market-decisions": { lotId: SAMPLE_ID },
  "GET /api/logistics/discover": { lat: "32.7266", lng: "74.857", radiusKm: "25" },
  "GET /api/weather/forecast": { lat: "32.7266", lng: "74.857" },
  "GET /api/location/pincode": { pin: "180001" },
  "GET /api/location/reverse": { lat: "32.7266", lng: "74.857" },
};

const BODY = {
  "POST /api/produce-lots": {
    crop: "Tomato",
    variety: "Hybrid",
    grade: "A",
    quantity: 12.5,
    unit: "quintal",
    location: "Narwal mandi area, Jammu",
    availableAt: day(0),
    sellBy: day(5),
  },
  "PATCH /api/produce-lots": { id: SAMPLE_ID, action: "publish" },
  "POST /api/market-decisions": { lotId: SAMPLE_ID },
  "PATCH /api/offers": { id: SAMPLE_ID, action: "decline" },
  "POST /api/logistics/feedback": { id: SAMPLE_ID, user_feedback: 4 },
  "POST /api/service-requests": { listing_id: SAMPLE_ID, requested_quantity: 10, unit: "quintal" },
  "PATCH /api/service-requests": { id: SAMPLE_ID, action: "cancel" },
  "POST /api/buyer-requirements": {
    crop: "Tomato",
    market_area: "Jammu",
    min_quantity: 5,
    unit: "quintal",
  },
  "PATCH /api/buyer-requirements": { id: SAMPLE_ID, status: "paused" },
  "POST /api/marketplace": {
    lot_id: SAMPLE_ID,
    quantity: 5,
    unit: "quintal",
    price_paise_per_quintal: 180000,
    valid_until: day(3),
  },
  "PATCH /api/buyer-offers": { id: SAMPLE_ID, action: "withdraw" },
  "POST /api/operator/services": {
    title: "Mini-truck transport",
    service_type: "transport",
    service_area: "Jammu district",
    rate_basis: "per_trip",
  },
  "PATCH /api/operator/services": { id: SAMPLE_ID, status: "paused" },
  "PATCH /api/operator/requests": { id: SAMPLE_ID, action: "accept" },
  "PATCH /api/notifications": { all: true },
  "PATCH /api/profile": { display_name: "API check" },
  "POST /api/market-data/refresh": { commodity: "Tomato", limit: 10 },
  "POST /api/admin/market-history": { commodity: "Tomato", state: "Maharashtra", days: 30 },
  "POST /api/produce-lots/{lotId}/quality-inspections": {
    checks: { appearance: "acceptable" },
    observations: "API check",
  },
  "PATCH /api/admin/provider-verification": {
    id: SAMPLE_ID,
    verification_state: "contact_verified",
    review_note: "Automated API collection check",
  },
  "POST /api/access-requests": {
    requested_role: "buyer",
    requester_name: "API Check",
    organisation_name: "API Check Traders",
    reason: "Automated API collection check request.",
  },
  "PATCH /api/admin/access-requests": {
    id: SAMPLE_ID,
    decision: "rejected",
    review_note: "Automated API collection check",
  },
};

const endpoints = [];
for (const [path, ops] of Object.entries(spec.paths)) {
  for (const [method, op] of Object.entries(ops)) {
    if (method === "parameters") continue;
    const key = `${method.toUpperCase()} ${path}`;
    const isPublic = Array.isArray(op.security) && op.security.length === 0;
    const entry = {
      name: op.summary,
      tag: (op.tags && op.tags[0]) || "General",
      method: method.toUpperCase(),
      path,
      auth: isPublic ? "public" : "signed-in",
      // Signed out: protected endpoints must refuse with 401. Public endpoints answer
      // 200, or 503 when a provider key is not configured (no data is invented).
      expect_signed_out: isPublic ? [200, 503] : [401],
      expect_documented: Object.keys(op.responses).map(Number),
    };
    if (path.includes("{lotId}")) entry.path_params = { lotId: SAMPLE_ID };
    if (QUERY[key]) entry.query = QUERY[key];
    if (BODY[key]) entry.body = BODY[key];
    endpoints.push(entry);
  }
}

const out = {
  $comment:
    "Farmess API collection. Generated from public/openapi.json; run api-tests/check_api.py to call every endpoint.",
  default_base_url: "https://farmess.vercel.app",
  endpoints,
};
fs.mkdirSync("api-tests", { recursive: true });
fs.writeFileSync("api-tests/endpoints.json", JSON.stringify(out, null, 2) + "\n");
console.log(`wrote ${endpoints.length} endpoints`);
