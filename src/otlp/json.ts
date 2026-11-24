/**
 * Decodes OTLP/JSON trace payloads (`ExportTraceServiceRequest` / `TracesData`).
 * Follows the OTLP/JSON mapping (lowerCamelCase keys, hex IDs, int64 as strings),
 * and is lenient about common deviations: base64 IDs, numeric int64s, enum names.
 */
import {
  hex,
  int64,
  nanosToMillis,
  spanKind,
  statusCode,
  withResource,
} from "./common.ts";
import type {
  AttrValue,
  Attributes,
  SpanData,
  SpanEvent,
  SpanLink,
} from "./types.ts";

type Json = any;

const HEX = /^[0-9a-fA-F]*$/;

function id(value: unknown, bytes: number): string {
  if (typeof value !== "string" || value === "") return "";
  if (value.length === bytes * 2 && HEX.test(value)) return value.toLowerCase();
  try {
    return hex(Uint8Array.from(atob(value), (c) => c.charCodeAt(0)));
  } catch {
    return value;
  }
}

function anyValue(v: Json): AttrValue {
  if (v == null || typeof v !== "object") return null;
  if ("stringValue" in v) return String(v.stringValue);
  if ("boolValue" in v) return Boolean(v.boolValue);
  if ("intValue" in v) {
    return typeof v.intValue === "number"
      ? v.intValue
      : int64(BigInt(v.intValue));
  }
  if ("doubleValue" in v) return Number(v.doubleValue);
  if ("arrayValue" in v)
    return ((v.arrayValue?.values ?? []) as Json[]).map(anyValue);
  if ("kvlistValue" in v) return attributes(v.kvlistValue?.values);
  if ("bytesValue" in v)
    return Uint8Array.from(atob(v.bytesValue ?? ""), (c) => c.charCodeAt(0));
  return null;
}

function attributes(list: Json): Attributes {
  const out: Attributes = {};
  if (Array.isArray(list))
    for (const kv of list) out[String(kv?.key ?? "")] = anyValue(kv?.value);
  return out;
}

const time = (v: unknown) =>
  v == null || v === "" ? 0 : nanosToMillis(v as string | number);

/** Decodes one OTLP/JSON traces object into spans */
export function decodeTracesJson(data: Json): SpanData[] {
  const out: SpanData[] = [];
  for (const rs of data?.resourceSpans ?? []) {
    const resource = attributes(rs?.resource?.attributes);
    for (const ss of rs?.scopeSpans ?? []) {
      const scope = {
        name: ss?.scope?.name ?? "",
        version: ss?.scope?.version ?? "",
      };
      for (const s of ss?.spans ?? []) {
        out.push(
          withResource(
            {
              traceId: id(s.traceId, 16),
              spanId: id(s.spanId, 8),
              parentSpanId: id(s.parentSpanId, 8),
              name: s.name ?? "",
              kind: spanKind(s.kind),
              start: time(s.startTimeUnixNano),
              end: time(s.endTimeUnixNano),
              attributes: attributes(s.attributes),
              events: (s.events ?? []).map((e: Json): SpanEvent => ({
                name: e.name ?? "",
                time: time(e.timeUnixNano),
                attributes: attributes(e.attributes),
              })),
              links: (s.links ?? []).map((l: Json): SpanLink => ({
                traceId: id(l.traceId, 16),
                spanId: id(l.spanId, 8),
                attributes: attributes(l.attributes),
              })),
              status: {
                code: statusCode(s.status?.code),
                message: s.status?.message ?? "",
              },
            },
            resource,
            scope,
          ),
        );
      }
    }
  }
  return out;
}

/**
 * Decodes a file of OTLP/JSON: a single object, or one object per line (what the
 * OpenTelemetry Collector's file exporter writes).
 */
export function decodeTracesJsonText(text: string): SpanData[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  try {
    return decodeTracesJson(JSON.parse(trimmed));
  } catch (error) {
    if (!trimmed.includes("\n")) throw error;
  }
  const out: SpanData[] = [];
  for (const line of trimmed.split("\n")) {
    if (line.trim()) out.push(...decodeTracesJson(JSON.parse(line)));
  }
  return out;
}
