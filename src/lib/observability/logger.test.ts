import assert from "node:assert/strict";
import test from "node:test";

import { formatLogLine, sanitizeLogFields, withApiLogging } from "./logger.ts";

function captureConsole() {
  const lines: string[] = [];
  const original = { info: console.info, warn: console.warn, error: console.error };
  console.info = (line: string) => lines.push(line);
  console.warn = (line: string) => lines.push(line);
  console.error = (line: string) => lines.push(line);
  return {
    lines,
    restore() {
      Object.assign(console, original);
    },
  };
}

test("sensitive fields are never written to logs", () => {
  const safe = sanitizeLogFields({
    route: "/api/profile",
    password: "hunter2",
    accessToken: "abc",
    email: "a@b.c",
    phone_number: "+91999",
    apiKey: "k",
    status: 200,
  });
  assert.deepEqual(safe, { route: "/api/profile", status: 200 });
});

test("log lines are single-line JSON with level and event", () => {
  const parsed = JSON.parse(formatLogLine("info", "api_request", { status: 201 }));
  assert.equal(parsed.level, "info");
  assert.equal(parsed.event, "api_request");
  assert.equal(parsed.status, 201);
  assert.ok(parsed.time);
});

test("wrapped handlers log status and duration and add timing headers", async () => {
  const capture = captureConsole();
  try {
    const handler = withApiLogging("/api/test", "GET", async () =>
      Response.json({ ok: true }, { status: 404 }),
    );
    const response = await handler();
    assert.equal(response.status, 404);
    assert.match(response.headers.get("Server-Timing") ?? "", /^app;dur=\d+$/);
    assert.ok(response.headers.get("X-Request-Id"));

    const entry = JSON.parse(capture.lines[0]);
    assert.equal(entry.level, "warn");
    assert.equal(entry.route, "/api/test");
    assert.equal(entry.status, 404);
    assert.equal(typeof entry.durationMs, "number");
  } finally {
    capture.restore();
  }
});

test("unexpected errors are logged and rethrown", async () => {
  const capture = captureConsole();
  try {
    const handler = withApiLogging("/api/test", "POST", async () => {
      throw new Error("database unavailable");
    });
    await assert.rejects(handler(), /database unavailable/);
    const entry = JSON.parse(capture.lines[0]);
    assert.equal(entry.level, "error");
    assert.equal(entry.event, "api_unhandled_error");
    assert.equal(entry.message, "database unavailable");
  } finally {
    capture.restore();
  }
});
