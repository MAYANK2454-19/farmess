# Market source verification — OGD India / AGMARKNET

**Owner:** Yash (FARMESS-04)  
**Checked:** 22 November 2026  
**Status:** Metadata verified; live API access and exact API response schema remain unverified.

## Selected candidate

- Resource: [Current Daily Price of Various Commodities from Various Markets (Mandi)](https://data.gov.in/resource/current-daily-price-various-commodities-various-markets-mandi)
- Catalogue: [OGD India mandi-price catalogue](https://data.gov.in/catalog/current-daily-price-various-commodities-various-markets-mandi)
- Publisher: Directorate of Marketing and Inspection (DMI), Department of Agriculture and Farmers Welfare, Ministry of Agriculture and Farmers Welfare, Government of India.
- Source lineage: OGD India identifies the dataset as generated through AGMARKNET.
- Resource ID used by the public OGD API: `9ef84268-d588-465a-a308-a864a43d0070`.
- Candidate API route: `https://api.data.gov.in/resource/9ef84268-d588-465a-a308-a864a43d0070`.
- Documented granularity: daily, not real-time.
- Catalogue description: wholesale minimum, maximum and modal prices on a daily basis.
- Government Open Data License — India: the resource catalogue is released under NDSAP; confirm the current resource-level licence/attribution text before external redistribution. Attribute OGD India, DMI and AGMARKNET and link to the source resource.

## Fields and units

The resource landing page currently exposes an incomplete field list in its rendered metadata, so the API schema must be checked using an authorized key before production activation. The implementation maps the commonly published OGD response fields:

- Geography/market: `state`, `district`, `market`
- Produce: `commodity`, `variety`, optional `grade`
- Observation date: `arrival_date`
- Prices: `min_price`, `max_price`, `modal_price`

The commonly published source price basis is INR per quintal. The adapter preserves that source unit as `sourcePriceUnit` and emits normalized `priceUnit: "INR/quintal"`; it does not convert to per-kg. The exact current response keys, nullability, date format and unit must be confirmed against an authenticated live response before calling the mapping production-verified.

## Access, terms and refresh

- Access method: server-side OGD API request with an API key in the `api-key` query parameter; no key is committed to the repository.
- Required environment variable: `DATA_GOV_IN_API_KEY`.
- Browser calls to the third-party API are prohibited; the app route proxies the request server-side.
- Daily granularity means an observation is reported for a market/date, not a guaranteed current price. The API route labels records older than 48 hours as stale; it does not call daily observations live.
- No API key was available in the repository environment during this check. A successful authenticated request, rate-limit behaviour, pagination ceiling, and exact licence terms have therefore not been independently tested.
- No prices are embedded as fallbacks. Missing key, source failure, schema mismatch and empty results return explicit unavailable/no-data states.

## Implementation notes

- `src/lib/market-data/normalize.ts` rejects incomplete identity/date fields, malformed or negative prices, reversed min/max ranges and modal prices outside a supplied range.
- `src/lib/market-data/ogd-provider.ts` performs server-only retrieval and preserves source observation date separately from retrieval time.
- `GET /api/market-prices` accepts optional commodity, state, district, market and limit filters.
- The current adapter is a guarded integration scaffold, not evidence of a successful source connection.

## Required verification before production

1. Add an authorized OGD API key to the server environment as `DATA_GOV_IN_API_KEY`.
2. Run a small, filtered request and capture the exact response schema, headers, pagination and rate-limit behaviour without logging the key.
3. Confirm the resource's current licence and attribution requirements from its resource page/API metadata.
4. Verify the source unit and date format using returned records, then update parser fixtures/tests from that real response.
5. Agree the stale threshold with the product team and display source observation date and retrieval time in the UI.
6. Add integration tests against a recorded, sanitized real response; do not commit personal data or API credentials.

## References

- [OGD India resource](https://data.gov.in/resource/current-daily-price-various-commodities-various-markets-mandi)
- [OGD India catalogue](https://data.gov.in/catalog/current-daily-price-various-commodities-various-markets-mandi)
- [OGD India variety-wise resource](https://data.gov.in/resource/variety-wise-daily-market-prices-data-commodity)
- [AGMARKNET](https://agmarknet.gov.in/)
