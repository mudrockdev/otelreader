import { describe, expect, test } from "bun:test";
import { decodeTracesJson, decodeTracesJsonText } from "../src/otlp/json.ts";
import { decodeTracesProto } from "../src/otlp/proto.ts";
import { SpanKind, StatusCode, type SpanData } from "../src/otlp/types.ts";
import { jsonPayload, protoPayload } from "./fixtures.ts";

function check(spans: SpanData[]) {
  expect(spans).toHaveLength(2);
  const root = spans.find((s) => s.name === "GET /checkout")!;
  const child = spans.find((s) => s.name === "db.query")!;

  expect(root.traceId).toMatch(/^[0-9a-f]{32}$/);
  expect(root.spanId).toMatch(/^[0-9a-f]{16}$/);
  expect(root.parentSpanId).toBe("");
  expect(child.traceId).toBe(root.traceId);
  expect(child.parentSpanId).toBe(root.spanId);

  expect(root.kind).toBe(SpanKind.Server);
  expect(child.kind).toBe(SpanKind.Client);
  expect(root.start).toBe(1_700_000_000_000);
  expect(root.end).toBe(1_700_000_000_100);
  expect(child.end).toBeCloseTo(1_700_000_000_040.5, 3);

  expect(root.attributes).toEqual({
    "http.request.method": "GET",
    "http.response.status_code": 500,
    "app.ratio": 0.25,
    "app.flags": [true, false],
    "app.big": 2 ** 40,
    "app.negative": -7,
  });
  expect(root.status).toEqual({
    code: StatusCode.Error,
    message: "checkout failed",
  });
  expect(root.events[0].name).toBe("exception");
  expect(root.events[0].attributes["exception.message"]).toBe("boom");
  expect(child.events).toEqual([
    { name: "rows", time: 1_700_000_000_015, attributes: { count: 3 } },
  ]);

  expect(root.service).toBe("shop");
  expect(root.resource["service.name"]).toBe("shop");
  expect(root.scope).toEqual({ name: "shop-tracer", version: "1.2.3" });
}

describe("protobuf", () => {
  test("decodes SDK output", () => check(decodeTracesProto(protoPayload())));

  test("empty payload has no spans", () => {
    expect(decodeTracesProto(new Uint8Array())).toEqual([]);
  });

  test("rejects truncated payloads", () => {
    const buf = protoPayload();
    expect(() => decodeTracesProto(buf.subarray(0, buf.length - 5))).toThrow();
  });
});

describe("json", () => {
  test("decodes SDK output", () =>
    check(decodeTracesJson(JSON.parse(jsonPayload()))));

  test("reads one object per line (collector file exporter)", () => {
    const line = jsonPayload();
    expect(decodeTracesJsonText(`${line}\n${line}\n`)).toHaveLength(4);
  });

  test("accepts base64 IDs, numeric int64s and enum names", () => {
    const [span] = decodeTracesJson({
      resourceSpans: [
        {
          scopeSpans: [
            {
              spans: [
                {
                  traceId: Buffer.from(
                    "0102030405060708090a0b0c0d0e0f10",
                    "hex",
                  ).toString("base64"),
                  spanId: "0102030405060708",
                  name: "x",
                  kind: "SPAN_KIND_PRODUCER",
                  startTimeUnixNano: 1_000_000,
                  endTimeUnixNano: "3000000",
                  attributes: [
                    { key: "n", value: { intValue: "9007199254740993" } },
                  ],
                  status: { code: "STATUS_CODE_OK" },
                },
              ],
            },
          ],
        },
      ],
    });
    expect(span.traceId).toBe("0102030405060708090a0b0c0d0e0f10");
    expect(span.kind).toBe(SpanKind.Producer);
    expect(span.end - span.start).toBe(2);
    expect(span.attributes.n).toBe("9007199254740993");
    expect(span.status.code).toBe(StatusCode.Ok);
    expect(span.service).toBe("unknown_service");
  });
});
