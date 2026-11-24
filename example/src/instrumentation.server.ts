// Loaded by SvelteKit before any application code (see `tracing.server` in vite.config.ts).
// Sends spans over OTLP/HTTP (protobuf) to http://localhost:4318/v1/traces, where
// otelreader listens by default. Override with OTEL_EXPORTER_OTLP_ENDPOINT.
import { context, propagation, trace } from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import { W3CTraceContextPropagator } from "@opentelemetry/core";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { BatchSpanProcessor, TracerProvider } from "@opentelemetry/sdk-trace";
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions";

// In dev, SvelteKit may evaluate this module more than once; set up the SDK only once per process.
const registered = Symbol.for("example.otel.registered");
const g = globalThis as typeof globalThis & { [registered]?: boolean };

if (!g[registered]) {
  g[registered] = true;

  const provider = new TracerProvider({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME ?? "example-sveltekit",
      [ATTR_SERVICE_VERSION]: "0.0.1",
      "process.runtime.name": process.versions.bun ? "bun" : "node",
    }),
    spanProcessors: [
      // a short delay so spans show up in the reader almost immediately
      new BatchSpanProcessor({
        exporter: new OTLPTraceExporter(),
        scheduledDelayMillis: 500,
      }),
    ],
  });

  context.setGlobalContextManager(
    new AsyncLocalStorageContextManager().enable(),
  );
  propagation.setGlobalPropagator(new W3CTraceContextPropagator());
  trace.setGlobalTracerProvider(provider);

  const shutdown = () => provider.shutdown().catch(console.error);
  process.once("beforeExit", shutdown);
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, async () => {
      await shutdown();
      process.exit(0);
    });
  }
}
