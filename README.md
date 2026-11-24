# otelreader

A terminal viewer for OpenTelemetry traces, built with [Svelte](https://svelte.dev) and [mudui](https://www.npmjs.com/package/mudui).

It runs an OTLP/HTTP receiver (protobuf or JSON, optionally gzipped) and shows traces as they arrive: a trace list, a span waterfall, and the attributes, events and resource of the selected span.

```sh
bun start                        # receive on http://localhost:4318/v1/traces
bun start --port 4319            # another port
bun start --no-receiver dump.json  # view OTLP/JSON (or JSONL, or protobuf) files
```

Point any OpenTelemetry SDK at it with `OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318`.
[`example/`](example) is a SvelteKit app on Bun that's set up to send traces to it.

## Keys

| View | Keys |
| --- | --- |
| Trace list | `↑↓` select · `enter` open · `/` filter (span name, service, trace id) · `e` errors only · `c` clear · `q` quit |
| Trace | `↑↓` move · `space` / `←→` fold · `tab` switch to details · `esc` back |

## Development

```sh
bun run dev     # run, restarting on changes
bun start       # run
bun test        # test

bun run build:linux     # single executables in dist/
bun run build:windows
bun run build:darwin    # Apple Silicon; `bun run build:darwin x64` for Intel
```

## License

Copyright (C) 2026 Ufuk Furkan Öztürk

This program is free software: you can redistribute it and/or modify it under the terms of the
GNU General Public License as published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version. See [LICENSE](LICENSE).
