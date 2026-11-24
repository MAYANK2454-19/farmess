# Farmess API collection and checks

Every Farmess API endpoint is listed in [`endpoints.json`](./endpoints.json) with its method, sample query or body, and expected status codes. The same list drives a Python checker and a Postman collection, so they cannot drift apart. Both are generated from the OpenAPI reference at [`/openapi.json`](../public/openapi.json) (viewable at `/api-docs`).

| File                                                 | Purpose                                                                       |
| ---------------------------------------------------- | ----------------------------------------------------------------------------- |
| `endpoints.json`                                     | The API collection: 42 operations across 24 routes                            |
| `check_api.py`                                       | Calls every endpoint and prints the status code, response time and request ID |
| `farmess.postman_collection.json`                    | Postman v2.1 collection with a status test on every request                   |
| `build_endpoints.mjs`, `build_postman_collection.py` | Regenerate the two files above                                                |

## Run the checker (Python 3, no installs)

```powershell
python api-tests/check_api.py                                   # live site, signed out
python api-tests/check_api.py --base-url http://localhost:3000   # local dev server
python api-tests/check_api.py --only Admin --report api-report.json
```

Signed out, protected endpoints must refuse with **401** and public endpoints must answer **200** (or **503** when a provider key such as `DATA_GOV_IN_API_KEY` is not configured; no data is ever invented). The checker also reports any status code that is not documented and any OpenAPI operation missing from the collection. It exits with a non-zero code on failure, so it can run in CI.

To test signed in, copy the `Cookie` request header from a signed-in browser session (DevTools → Network) into `FARMESS_COOKIE` for that command. Write requests use placeholder IDs, so they are rejected safely instead of changing real records.

## Use the Postman collection

1. Postman → **Import** → choose `api-tests/farmess.postman_collection.json`.
2. The `baseUrl` collection variable points at the live site; change it for local testing.
3. **Run collection** to execute all 42 requests with their status tests.

Headless alternative: `npx newman run api-tests/farmess.postman_collection.json`.

## Regenerate after changing the API

```powershell
npm run api:collection
```
