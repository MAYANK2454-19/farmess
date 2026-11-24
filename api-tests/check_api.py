#!/usr/bin/env python3
"""Call every Farmess API endpoint and report its HTTP status.

Reads the API collection in endpoints.json (method, path, sample query/body and
expected status codes), sends each request and prints a table with the return
code, response time and request ID. Standard library only — no installs.

Modes
  Signed out (default): proves protected endpoints refuse access (401) and
  public endpoints answer (200, or 503 when a provider key is not configured).

  Signed in: set FARMESS_COOKIE to the Cookie header copied from a signed-in
  browser session (DevTools > Network > any request > Request Headers).
  Statuses are then checked against the documented responses. Write requests
  use placeholder IDs, so they are rejected safely (400/404/409) rather than
  changing real records.

Examples
  python api-tests/check_api.py
  python api-tests/check_api.py --base-url http://localhost:3000
  python api-tests/check_api.py --only Admin --report api-report.json
  python api-tests/check_api.py --path produce-lots --method POST
  python api-tests/check_api.py --list
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
DEFAULT_ENDPOINTS = HERE / "endpoints.json"
DEFAULT_OPENAPI = HERE.parent / "public" / "openapi.json"
HTTP_METHODS = {"get", "post", "put", "patch", "delete"}


def supports_colour() -> bool:
    return sys.stdout.isatty() and os.environ.get("NO_COLOR") is None


def paint(text: str, code: str) -> str:
    return f"\033[{code}m{text}\033[0m" if supports_colour() else text


def build_url(base_url: str, endpoint: dict) -> str:
    path = endpoint["path"]
    for name, value in endpoint.get("path_params", {}).items():
        path = path.replace("{" + name + "}", urllib.parse.quote(str(value)))
    url = base_url.rstrip("/") + path
    if endpoint.get("query"):
        url += "?" + urllib.parse.urlencode(endpoint["query"])
    return url


def call(base_url: str, endpoint: dict, cookie: str | None, timeout: float) -> dict:
    url = build_url(base_url, endpoint)
    method = endpoint["method"]
    body = endpoint.get("body")
    data = json.dumps(body).encode("utf-8") if body is not None and method != "GET" else None

    headers = {
        "Accept": "application/json",
        # Mutating routes require a same-origin request (CSRF protection).
        "Origin": base_url.rstrip("/"),
        "User-Agent": "farmess-api-check/1.0",
    }
    if data is not None:
        headers["Content-Type"] = "application/json"
    if cookie:
        headers["Cookie"] = cookie

    request = urllib.request.Request(url, data=data, headers=headers, method=method)
    started = time.perf_counter()
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            status, response_headers, raw = response.status, response.headers, response.read()
    except urllib.error.HTTPError as error:  # 4xx/5xx still carry a response
        status, response_headers, raw = error.code, error.headers, error.read()
    except (urllib.error.URLError, TimeoutError, OSError) as error:
        return {"status": None, "ms": None, "error": str(error), "url": url}

    elapsed = round((time.perf_counter() - started) * 1000)
    message = None
    try:
        payload = json.loads(raw.decode("utf-8") or "null")
        if isinstance(payload, dict):
            message = payload.get("error") or payload.get("message") or payload.get("status")
    except (ValueError, UnicodeDecodeError):
        pass

    return {
        "status": status,
        "ms": elapsed,
        "server_timing": response_headers.get("Server-Timing"),
        "request_id": response_headers.get("X-Request-Id"),
        "message": message,
        "url": url,
    }


def coverage_gaps(endpoints: list[dict], openapi_path: Path) -> list[str]:
    if not openapi_path.is_file():
        return []
    spec = json.loads(openapi_path.read_text(encoding="utf-8"))
    documented = {
        f"{method.upper()} {path}"
        for path, operations in spec.get("paths", {}).items()
        for method in operations
        if method in HTTP_METHODS
    }
    collected = {f"{e['method']} {e['path']}" for e in endpoints}
    return sorted(documented - collected)


def main() -> int:
    parser = argparse.ArgumentParser(description="Check every Farmess API endpoint.")
    parser.add_argument("--base-url", help="Defaults to default_base_url in endpoints.json")
    parser.add_argument("--endpoints", type=Path, default=DEFAULT_ENDPOINTS)
    parser.add_argument("--openapi", type=Path, default=DEFAULT_OPENAPI)
    parser.add_argument("--only", help="Run only endpoints with this tag (e.g. Farmer, Admin)")
    parser.add_argument(
        "--path", help="Run only endpoints whose path contains this text (e.g. produce-lots)"
    )
    parser.add_argument("--method", help="Run only this HTTP method (GET, POST, PATCH)")
    parser.add_argument(
        "--list", action="store_true", help="List the endpoints in the collection and exit"
    )
    parser.add_argument("--timeout", type=float, default=30.0)
    parser.add_argument("--report", type=Path, help="Write a JSON report to this file")
    args = parser.parse_args()

    collection = json.loads(args.endpoints.read_text(encoding="utf-8"))
    base_url = args.base_url or collection["default_base_url"]
    endpoints = collection["endpoints"]
    if args.only:
        endpoints = [e for e in endpoints if e.get("tag", "").lower() == args.only.lower()]
    if args.path:
        endpoints = [e for e in endpoints if args.path.lower() in e["path"].lower()]
    if args.method:
        endpoints = [e for e in endpoints if e["method"] == args.method.upper()]

    if args.list:
        for endpoint in endpoints:
            print(f"{endpoint['tag']:<12}{endpoint['method']:<7}{endpoint['path']}")
        print(f"\n{len(endpoints)} endpoints")
        return 0
    if not endpoints:
        print("No endpoints match those filters. Use --list to see them all.")
        return 1

    cookie = os.environ.get("FARMESS_COOKIE", "").strip() or None
    mode = "signed in (FARMESS_COOKIE)" if cookie else "signed out"

    print(f"Farmess API check  ->  {base_url}  ({mode})")
    print(f"{len(endpoints)} endpoints from {args.endpoints.name}\n")
    header = f"{'RESULT':<7}{'CODE':>5}{'MS':>7}  {'METHOD':<7}{'PATH':<48}NOTE"
    print(header)
    print("-" * len(header))

    results = []
    failures = 0
    undocumented = 0
    for endpoint in endpoints:
        outcome = call(base_url, endpoint, cookie, args.timeout)
        status = outcome["status"]
        expected = endpoint["expect_documented"] if cookie else endpoint["expect_signed_out"]
        passed = status is not None and status in expected
        documented = status in endpoint.get("expect_documented", [])
        failures += 0 if passed else 1
        if status is not None and not documented:
            undocumented += 1

        note = outcome.get("error") or outcome.get("message") or ""
        if status is not None and not documented:
            note = f"[undocumented status] {note}"
        if not passed and status is not None:
            note = f"expected {expected}; {note}"

        label = paint("PASS", "32") if passed else paint("FAIL", "31")
        code = str(status) if status is not None else "---"
        ms = str(outcome["ms"]) if outcome["ms"] is not None else "-"
        print(f"{label:<7}{code:>5}{ms:>7}  {endpoint['method']:<7}{endpoint['path']:<48}{str(note)[:70]}")

        results.append({**endpoint, "result": "pass" if passed else "fail", **outcome})

    gaps = coverage_gaps(collection["endpoints"], args.openapi)
    timings = [r["ms"] for r in results if r.get("ms") is not None]

    print("\nSummary")
    print(f"  Passed:   {len(results) - failures}/{len(results)}")
    if timings:
        timings.sort()
        median = timings[len(timings) // 2]
        print(f"  Latency:  median {median} ms, max {timings[-1]} ms (network + server)")
    print(f"  Undocumented status codes: {undocumented}")
    if gaps:
        print(f"  Missing from collection: {', '.join(gaps)}")
    else:
        print("  Coverage: every OpenAPI operation is in the collection")

    if args.report:
        args.report.write_text(
            json.dumps(
                {
                    "base_url": base_url,
                    "mode": mode,
                    "checked_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                    "passed": len(results) - failures,
                    "total": len(results),
                    "missing_from_collection": gaps,
                    "results": results,
                },
                indent=2,
            ),
            encoding="utf-8",
        )
        print(f"  Report:   {args.report}")

    return 0 if failures == 0 and not gaps else 1


if __name__ == "__main__":
    raise SystemExit(main())
