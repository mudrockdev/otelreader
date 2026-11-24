// Builds real spans with the OpenTelemetry SDK, for round-trip tests
import { context, SpanKind, SpanStatusCode, trace } from "@opentelemetry/api";
import {
  JsonTraceSerializer,
  ProtobufTraceSerializer,
} from "@opentelemetry/otlp-transformer";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
  TracerProvider,
  type ReadableSpan,
} from "@opentelemetry/sdk-trace";
import type { SpanData } from "../src/otlp/types.ts";

export function sdkSpans(): ReadableSpan[] {
  const exporter = new InMemorySpanExporter();
  const provider = new TracerProvider({
    resource: resourceFromAttributes({ "service.name": "shop" }),
    spanProcessors: [new SimpleSpanProcessor({ exporter })],
  });
  const tracer = provider.getTracer("shop-tracer", "1.2.3");

  const root = tracer.startSpan("GET /checkout", {
    kind: SpanKind.SERVER,
    startTime: 1_700_000_000_000,
    attributes: {
      "http.request.method": "GET",
      "http.response.status_code": 500,
      "app.ratio": 0.25,
      "app.flags": [true, false],
      "app.big": 2 ** 40,
      "app.negative": -7,
    },
  });
  const ctx = trace.setSpan(context.active(), root);
  const child = tracer.startSpan(
    "db.query",
    { kind: SpanKind.CLIENT, startTime: 1_700_000_000_010 },
    ctx,
  );
  child.addEvent("rows", { count: 3 }, 1_700_000_000_015);
  child.end(1_700_000_000_040.5);
  root.recordException(new Error("boom"), 1_700_000_000_050);
  root.setStatus({ code: SpanStatusCode.ERROR, message: "checkout failed" });
  root.end(1_700_000_000_100);

  return exporter.getFinishedSpans();
}

export const protoPayload = () =>
  new Uint8Array(ProtobufTraceSerializer.serializeRequest(sdkSpans())!);
export const jsonPayload = () =>
  new TextDecoder().decode(JsonTraceSerializer.serializeRequest(sdkSpans())!);

/** A hand-made span, for UI and store tests */
export function span(
  fields: Partial<SpanData> & Pick<SpanData, "traceId" | "spanId" | "name">,
): SpanData {
  const service = fields.service ?? "web";
  return {
    parentSpanId: "",
    kind: 1,
    start: 1_700_000_000_000,
    end: 1_700_000_000_010,
    attributes: {},
    events: [],
    links: [],
    status: { code: 0, message: "" },
    resource: { "service.name": service },
    scope: { name: "test", version: "" },
    service,
    ...fields,
  };
}
