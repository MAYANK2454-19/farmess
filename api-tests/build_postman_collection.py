#!/usr/bin/env python3
"""Generate a Postman v2.1 collection from endpoints.json.

Every request carries a test that checks the status code against the
expected signed-out codes, plus a timing and documented-status check.
Import the output into Postman (File > Import), or run it headless:

  npx newman run api-tests/farmess.postman_collection.json

Regenerate after editing endpoints.json:
  python api-tests/build_postman_collection.py
"""
from __future__ import annotations

import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
SOURCE = HERE / "endpoints.json"
OUTPUT = HERE / "farmess.postman_collection.json"


def to_postman_path(path: str) -> list[str]:
    # Postman path variables use :name; values come from the request's "variable" list.
    return [
        (":" + segment[1:-1]) if segment.startswith("{") else segment
        for segment in path.strip("/").split("/")
    ]


def build_item(endpoint: dict) -> dict:
    expected = endpoint["expect_signed_out"]
    documented = endpoint["expect_documented"]
    raw_path = "/" + "/".join(to_postman_path(endpoint["path"]))
    query = [{"key": key, "value": str(value)} for key, value in endpoint.get("query", {}).items()]
    raw = "{{baseUrl}}" + raw_path
    if query:
        raw += "?" + "&".join(f"{q['key']}={q['value']}" for q in query)

    request: dict = {
        "method": endpoint["method"],
        "header": [
            {"key": "Accept", "value": "application/json"},
            {"key": "Origin", "value": "{{baseUrl}}"},
        ],
        "url": {
            "raw": raw,
            "host": ["{{baseUrl}}"],
            "path": to_postman_path(endpoint["path"]),
            "query": query,
            "variable": [
                {"key": key, "value": str(value)}
                for key, value in endpoint.get("path_params", {}).items()
            ],
        },
        "description": f"{endpoint['name']}\n\nAuth: {endpoint['auth']}. "
        f"Signed-out expectation: {expected}. Documented responses: {documented}.",
    }
    if endpoint.get("body") is not None and endpoint["method"] != "GET":
        request["header"].append({"key": "Content-Type", "value": "application/json"})
        request["body"] = {
            "mode": "raw",
            "raw": json.dumps(endpoint["body"], indent=2),
            "options": {"raw": {"language": "json"}},
        }

    test_script = [
        f"const signedOut = {json.dumps(expected)};",
        f"const documented = {json.dumps(documented)};",
        "const signedIn = Boolean(pm.collectionVariables.get('cookie'));",
        "pm.test('status is expected (' + pm.response.code + ')', function () {",
        "  pm.expect(signedIn ? documented : signedOut).to.include(pm.response.code);",
        "});",
        "pm.test('status is documented in the API reference', function () {",
        "  pm.expect(documented).to.include(pm.response.code);",
        "});",
        "pm.test('responds within 5 seconds', function () {",
        "  pm.expect(pm.response.responseTime).to.be.below(5000);",
        "});",
    ]
    return {
        "name": f"{endpoint['method']} {endpoint['path']}",
        "request": request,
        "event": [{"listen": "test", "script": {"type": "text/javascript", "exec": test_script}}],
    }


def main() -> int:
    collection_source = json.loads(SOURCE.read_text(encoding="utf-8"))
    folders: dict[str, list[dict]] = {}
    for endpoint in collection_source["endpoints"]:
        folders.setdefault(endpoint.get("tag", "General"), []).append(build_item(endpoint))

    collection = {
        "info": {
            "name": "Farmess API",
            "description": (
                "Every Farmess API endpoint with sample requests and status tests. "
                "Signed out (default), protected endpoints must return 401 and public ones "
                "200 (or 503 when a provider key is not configured). To test signed in, set the "
                "collection variable 'cookie' to the Cookie header from a signed-in browser session."
            ),
            "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
        },
        "variable": [
            {"key": "baseUrl", "value": collection_source["default_base_url"]},
            {"key": "cookie", "value": ""},
        ],
        "event": [
            {
                "listen": "prerequest",
                "script": {
                    "type": "text/javascript",
                    "exec": [
                        "const cookie = pm.collectionVariables.get('cookie');",
                        "if (cookie) { pm.request.headers.upsert({ key: 'Cookie', value: cookie }); }",
                    ],
                },
            }
        ],
        "item": [{"name": name, "item": items} for name, items in folders.items()],
    }
    OUTPUT.write_text(json.dumps(collection, indent=2) + "\n", encoding="utf-8")
    total = sum(len(items) for items in folders.values())
    print(f"Wrote {OUTPUT.name}: {total} requests in {len(folders)} folders")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
