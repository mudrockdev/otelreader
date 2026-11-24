/** An attribute value, as in OTLP's `AnyValue` (int64 values outside the safe range become strings) */
export type AttrValue =
  string | number | boolean | null | Uint8Array | AttrValue[] | Attributes;
export type Attributes = { [key: string]: AttrValue };

export enum SpanKind {
  Unspecified = 0,
  Internal = 1,
  Server = 2,
  Client = 3,
  Producer = 4,
  Consumer = 5,
}

export enum StatusCode {
  Unset = 0,
  Ok = 1,
  Error = 2,
}

export interface SpanEvent {
  name: string;
  /** Unix time in milliseconds */
  time: number;
  attributes: Attributes;
}

export interface SpanLink {
  traceId: string;
  spanId: string;
  attributes: Attributes;
}

/** A span, decoded from OTLP. IDs are lowercase hex; times are Unix milliseconds (with sub-ms precision). */
export interface SpanData {
  traceId: string;
  spanId: string;
  /** Empty for root spans */
  parentSpanId: string;
  name: string;
  kind: SpanKind;
  start: number;
  end: number;
  attributes: Attributes;
  events: SpanEvent[];
  links: SpanLink[];
  status: { code: StatusCode; message: string };
  resource: Attributes;
  scope: { name: string; version: string };
  /** `service.name` from the resource */
  service: string;
}
