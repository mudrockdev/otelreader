import { afterAll, beforeEach, expect, test } from "bun:test";
import type { SpanData } from "../src/otlp/types.ts";
import { startReceiver } from "../src/receiver.ts";
import { jsonPayload, protoPayload } from "./fixtures.ts";

let received: SpanData[] = [];
let errors: string[] = [];
const receiver = startReceiver({
  port: 0,
  hostname: "127.0.0.1",
  onSpans: (spans) => received.push(...spans),
  onError: (message) => errors.push(message),
});
afterAll(() => receiver.stop());
beforeEach(() => {
  received = [];
  errors = [];
});

const post = (path: string, body: BodyInit, headers: Record<string, string>) =>
  fetch(`${receiver.url}${path}`, { method: "POST", body, headers });

test("accepts protobuf", async () => {
  const res = await post("/v1/traces", protoPayload(), {
    "content-type": "application/x-protobuf",
  });
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toBe("application/x-protobuf");
  expect(received.map((s) => s.name).sort()).toEqual([
    "GET /checkout",
    "db.query",
  ]);
});

test("accepts JSON", async () => {
  const res = await post("/v1/traces", jsonPayload(), {
    "content-type": "application/json",
  });
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({});
  expect(received).toHaveLength(2);
});

test("accepts gzip", async () => {
  const res = await post("/v1/traces", Bun.gzipSync(protoPayload()), {
    "content-type": "application/x-protobuf",
    "content-encoding": "gzip",
  });
  expect(res.status).toBe(200);
  expect(received).toHaveLength(2);
});

test("rejects bad payloads", async () => {
  const res = await post("/v1/traces", "{not json", {
    "content-type": "application/json",
  });
  expect(res.status).toBe(400);
  expect(errors[0]).toContain("bad JSON payload");
  expect(received).toHaveLength(0);
});

test("accepts and ignores logs and metrics", async () => {
  for (const path of ["/v1/logs", "/v1/metrics"]) {
    const res = await post(path, new Uint8Array([1, 2, 3]), {
      "content-type": "application/x-protobuf",
    });
    expect(res.status).toBe(200);
  }
  expect(received).toHaveLength(0);
});

test("answers CORS preflights", async () => {
  const res = await fetch(`${receiver.url}/v1/traces`, { method: "OPTIONS" });
  expect(res.status).toBe(204);
  expect(res.headers.get("access-control-allow-origin")).toBe("*");
});
