import assert from "node:assert/strict";
import test from "node:test";

import { fetchOgdRecordsPaginated } from "./ogd-pagination.ts";

function jsonResponse(records: unknown[], status = 200): Response {
  return new Response(JSON.stringify({ records }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("fetches multiple full pages using increasing offsets", async () => {
  const calls: Array<{ limit: string | null; offset: string | null }> = [];
  const records = await fetchOgdRecordsPaginated(
    new URL("https://example.test/resource"),
    250,
    async (url) => {
      calls.push({
        limit: url.searchParams.get("limit"),
        offset: url.searchParams.get("offset"),
      });
      const offset = Number(url.searchParams.get("offset"));
      const limit = Number(url.searchParams.get("limit"));
      return jsonResponse(Array.from({ length: limit }, (_, index) => offset + index));
    },
  );

  assert.equal(records.length, 250);
  assert.deepEqual(calls, [
    { limit: "100", offset: "0" },
    { limit: "100", offset: "100" },
    { limit: "50", offset: "200" },
  ]);
});

test("preserves source filters and API parameters across pages", async () => {
  const calls: URL[] = [];
  await fetchOgdRecordsPaginated(
    new URL(
      "https://example.test/resource?api-key=secret&format=json&filters%5Bstate%5D=Rajasthan",
    ),
    150,
    async (url) => {
      calls.push(url);
      return jsonResponse(
        Array.from({ length: Number(url.searchParams.get("limit")) }, () => ({})),
      );
    },
  );

  assert.equal(calls.length, 2);
  for (const url of calls) {
    assert.equal(url.searchParams.get("api-key"), "secret");
    assert.equal(url.searchParams.get("format"), "json");
    assert.equal(url.searchParams.get("filters[state]"), "Rajasthan");
  }
});

test("stops when the source returns a short page", async () => {
  let calls = 0;
  const records = await fetchOgdRecordsPaginated(
    new URL("https://example.test/resource"),
    250,
    async () => {
      calls += 1;
      return jsonResponse([1, 2, 3]);
    },
  );

  assert.deepEqual(records, [1, 2, 3]);
  assert.equal(calls, 1);
});

test("returns an empty list when the source has no records", async () => {
  const records = await fetchOgdRecordsPaginated(
    new URL("https://example.test/resource"),
    100,
    async () => jsonResponse([]),
  );

  assert.deepEqual(records, []);
});

test("rejects the complete fetch when a later page fails", async () => {
  let calls = 0;
  await assert.rejects(
    fetchOgdRecordsPaginated(new URL("https://example.test/resource"), 150, async () => {
      calls += 1;
      return calls === 1
        ? jsonResponse(Array.from({ length: 100 }, (_, index) => index))
        : jsonResponse([], 503);
    }),
    /HTTP 503/,
  );
  assert.equal(calls, 2);
});

test("rejects malformed page payloads", async () => {
  await assert.rejects(
    fetchOgdRecordsPaginated(
      new URL("https://example.test/resource"),
      10,
      async () => new Response(JSON.stringify({ data: [] })),
    ),
    /records array/,
  );
});

test("rejects limits outside the supported source request range", async () => {
  await assert.rejects(
    fetchOgdRecordsPaginated(new URL("https://example.test/resource"), 501, async () =>
      jsonResponse([]),
    ),
    /limit must be a whole number/,
  );
});

test("starts at the requested historical offset and advances across later pages", async () => {
  const calls: Array<{ limit: string | null; offset: string | null }> = [];
  const records = await fetchOgdRecordsPaginated(
    new URL("https://example.test/resource?offset=500&format=json"),
    150,
    async (url) => {
      calls.push({
        limit: url.searchParams.get("limit"),
        offset: url.searchParams.get("offset"),
      });
      const offset = Number(url.searchParams.get("offset"));
      const limit = Number(url.searchParams.get("limit"));
      return jsonResponse(Array.from({ length: limit }, (_, index) => offset + index));
    },
  );

  assert.equal(records.length, 150);
  assert.deepEqual(calls, [
    { limit: "100", offset: "500" },
    { limit: "50", offset: "600" },
  ]);
});

test("rejects source offsets outside the supported range", async () => {
  await assert.rejects(
    fetchOgdRecordsPaginated(
      new URL("https://example.test/resource?offset=100001"),
      10,
      async () => jsonResponse([]),
    ),
    /offset must be a whole number from 0 to 100000/,
  );
});
