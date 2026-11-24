import { parseArgs } from "node:util";
import { render } from "mudui";
import pkg from "../package.json" with { type: "json" };
import App from "./App.svelte";
import { decodeTracesJsonText } from "./otlp/json.ts";
import { decodeTracesProto } from "./otlp/proto.ts";
import type { SpanData } from "./otlp/types.ts";
import { startReceiver } from "./receiver.ts";
import { TraceStore } from "./store.svelte.ts";

const usage = `otelreader: a terminal viewer for OpenTelemetry traces

Usage: otelreader [options] [files...]

Receives OTLP/HTTP traces (protobuf or JSON) on POST /v1/traces, and shows them as they arrive.
Files can be OTLP/JSON (one object, or one per line as the Collector's file exporter writes)
or OTLP protobuf.

Options:
  -p, --port <port>   port for the OTLP/HTTP receiver (default: 4318, or $OTELREADER_PORT)
      --host <host>   address to listen on (default: 0.0.0.0)
      --no-receiver   don't start the receiver (only view files)
      --limit <n>     keep at most n traces (default: 2000)
  -v, --version       show the version
  -h, --help          show this help
`;

const { values, positionals } = parseArgs({
  args: Bun.argv.slice(2),
  allowPositionals: true,
  allowNegative: true,
  options: {
    port: { type: "string", short: "p" },
    host: { type: "string", default: "0.0.0.0" },
    receiver: { type: "boolean", default: true },
    limit: { type: "string", default: "2000" },
    help: { type: "boolean", short: "h" },
    version: { type: "boolean", short: "v" },
  },
});

if (values.help) {
  process.stdout.write(usage);
  process.exit(0);
}
if (values.version) {
  process.stdout.write(`${pkg.version}\n`);
  process.exit(0);
}

const port = Number(values.port ?? process.env.OTELREADER_PORT ?? 4318);
const limit = Number(values.limit);
if (!Number.isInteger(port) || port < 0 || port > 65535)
  fail(`invalid port: ${values.port}`);
if (!Number.isInteger(limit) || limit < 1)
  fail(`invalid limit: ${values.limit}`);

function fail(message: string): never {
  process.stderr.write(`otelreader: ${message}\n`);
  process.exit(1);
}

async function readFile(path: string): Promise<SpanData[]> {
  const file = Bun.file(path);
  if (!(await file.exists())) fail(`no such file: ${path}`);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const first = bytes.find(
    (b) => b !== 0x20 && b !== 0x0a && b !== 0x0d && b !== 0x09,
  );
  try {
    // OTLP/JSON starts with `{`; a protobuf ExportTraceServiceRequest starts with tag 0x0a
    return first === 0x7b
      ? decodeTracesJsonText(new TextDecoder().decode(bytes))
      : decodeTracesProto(bytes);
  } catch (error) {
    fail(`can't read ${path}: ${(error as Error).message}`);
  }
}

const store = new TraceStore(limit);
for (const path of positionals) store.add(await readFile(path));

const receiver: { url?: string; error?: string } = {};
let stopReceiver = () => {};
if (values.receiver) {
  try {
    const r = startReceiver({
      port,
      hostname: values.host,
      onSpans: (spans) => store.add(spans),
      onError: (message) => store.reject(message),
    });
    receiver.url = r.url;
    stopReceiver = r.stop;
  } catch (error) {
    const code = (error as { code?: string }).code;
    receiver.error =
      code === "EADDRINUSE"
        ? `port ${port} is in use, try --port`
        : `receiver failed: ${(error as Error).message}`;
  }
}

const app = render(App, { props: { store, receiver } });
await app.waitUntilExit();
stopReceiver();
process.exit(0);
