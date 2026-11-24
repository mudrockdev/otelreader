# example

A small SvelteKit app, running on Bun, that sends OpenTelemetry traces to otelreader.

```sh
bun install
bun run dev                 # dev server on Bun
bun run build && bun start  # production build (adapter-node), served by Bun
```

Spans go over OTLP/HTTP (protobuf) to `http://localhost:4318/v1/traces`. Set
`OTEL_EXPORTER_OTLP_ENDPOINT` to send them somewhere else, and `OTEL_SERVICE_NAME`
to change the service name (default `example-sveltekit`).

## How it's wired

- `vite.config.ts` uses `tracing: { server: true }`, so SvelteKit creates spans for
  `handle`, `resolve`, `load`, `+server` endpoints, form actions and remote functions.
- `src/instrumentation.server.ts` sets up the SDK (tracer provider, OTLP exporter,
  AsyncLocalStorage context manager, W3C propagator). SvelteKit loads it before the app.
- `src/lib/server/tracing.ts` has a `traced(name, attributes, fn)` helper for custom spans.

## Routes

| Route | Trace |
| --- | --- |
| `/` | `load` → `db.query products`, `inventory.lookup` (a `fetch` to `/api/inventory`, nested in the same trace, with a cache span and sometimes a DB span), `pricing.compute` (with a span event) |
| `/api/inventory?ids=1,2` | `+server` endpoint on its own |
| `/boom` | a failing `payment.charge` span with a recorded exception, and a 502 |
