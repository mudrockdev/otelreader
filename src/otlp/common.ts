import {
  SpanKind,
  StatusCode,
  type Attributes,
  type SpanData,
} from "./types.ts";

export function hex(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

/** Unix nanoseconds to Unix milliseconds */
export function nanosToMillis(ns: bigint | number | string): number {
  if (typeof ns === "number") return ns / 1e6;
  const big = BigInt(ns);
  // split to keep microsecond precision (a float64 can't hold ns since 1970 exactly)
  return Number(big / 1000n) / 1000;
}

/** An int64 as a number when it's safe, otherwise as a decimal string */
export function int64(value: bigint): number | string {
  return value >= BigInt(Number.MIN_SAFE_INTEGER) &&
    value <= BigInt(Number.MAX_SAFE_INTEGER)
    ? Number(value)
    : value.toString();
}

const kinds: Record<string, SpanKind> = {
  SPAN_KIND_UNSPECIFIED: SpanKind.Unspecified,
  SPAN_KIND_INTERNAL: SpanKind.Internal,
  SPAN_KIND_SERVER: SpanKind.Server,
  SPAN_KIND_CLIENT: SpanKind.Client,
  SPAN_KIND_PRODUCER: SpanKind.Producer,
  SPAN_KIND_CONSUMER: SpanKind.Consumer,
};

const codes: Record<string, StatusCode> = {
  STATUS_CODE_UNSET: StatusCode.Unset,
  STATUS_CODE_OK: StatusCode.Ok,
  STATUS_CODE_ERROR: StatusCode.Error,
};

/** Enums are integers in OTLP/JSON, but some producers write their names */
export function spanKind(value: unknown): SpanKind {
  if (typeof value === "string") return kinds[value] ?? SpanKind.Unspecified;
  return typeof value === "number" && value >= 0 && value <= 5
    ? value
    : SpanKind.Unspecified;
}

export function statusCode(value: unknown): StatusCode {
  if (typeof value === "string") return codes[value] ?? StatusCode.Unset;
  return value === 1 || value === 2 ? value : StatusCode.Unset;
}

export function serviceOf(resource: Attributes): string {
  const name = resource["service.name"];
  return typeof name === "string" && name ? name : "unknown_service";
}

export type PartialSpan = Omit<SpanData, "resource" | "scope" | "service">;

export function withResource(
  span: PartialSpan,
  resource: Attributes,
  scope: SpanData["scope"],
): SpanData {
  return { ...span, resource, scope, service: serviceOf(resource) };
}
