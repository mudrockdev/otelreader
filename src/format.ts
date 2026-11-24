import { SpanKind, type AttrValue } from "./otlp/types.ts";

/** A compact duration: `850µs`, `12.3ms`, `152ms`, `1.24s`, `2m05s` */
export function duration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "?";
  if (ms < 1) return `${Math.round(ms * 1000)}µs`;
  if (ms < 10) return `${ms.toFixed(2)}ms`;
  if (ms < 100) return `${ms.toFixed(1)}ms`;
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(2)}s`;
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}m${String(s % 60).padStart(2, "0")}s`;
}

const pad = (n: number, w = 2) => String(n).padStart(w, "0");

/** Local wall-clock time, `HH:MM:SS.mmm` */
export function clock(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

export function kindName(kind: SpanKind): string {
  return SpanKind[kind]?.toLowerCase() ?? "unspecified";
}

/** An attribute value for display: strings as-is, everything else JSON-like */
export function attrValue(value: AttrValue): string {
  if (typeof value === "string") return value;
  return render(value);
}

function render(value: AttrValue): string {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value !== "object") return String(value);
  if (value instanceof Uint8Array)
    return `0x${Buffer.from(value).toString("hex")}`;
  if (Array.isArray(value)) return `[${value.map(render).join(", ")}]`;
  return `{${Object.entries(value)
    .map(([k, v]) => `${k}: ${render(v)}`)
    .join(", ")}}`;
}

const palette = [
  "cyan",
  "magenta",
  "yellow",
  "blue",
  "green",
  "brightCyan",
  "brightMagenta",
  "brightBlue",
];

/** A stable color per service name */
export function serviceColor(service: string): string {
  let h = 0;
  for (let i = 0; i < service.length; i++)
    h = (h * 31 + service.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}
