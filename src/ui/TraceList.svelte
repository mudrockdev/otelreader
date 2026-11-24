<script lang="ts">
  import { Table, getTheme, type TableColumn } from "mudui";
  import { clock, duration, serviceColor } from "../format.ts";
  import type { Trace } from "../store.svelte.ts";

  let {
    traces,
    selectedId,
    emptyText,
    onchange,
    onopen,
  }: {
    traces: Trace[];
    selectedId: string;
    emptyText: string;
    onchange: (trace: Trace) => void;
    onopen: (trace: Trace) => void;
  } = $props();

  const theme = getTheme();
  let height = $state(10);

  // keep the selection on the same trace as new ones arrive at the top
  const index = $derived(
    Math.max(
      0,
      traces.findIndex((t) => t.id === selectedId),
    ),
  );

  const services = (t: Trace) =>
    t.root.service +
    (t.services.length > 1 ? ` +${t.services.length - 1}` : "");

  const columns: TableColumn<Trace>[] = [
    {
      key: "time",
      title: "Time",
      width: 12,
      format: (t) => clock(t.start),
      color: theme.muted,
    },
    {
      key: "service",
      title: "Service",
      maxWidth: 22,
      format: services,
      color: (t) => serviceColor(t.root.service),
    },
    {
      key: "name",
      title: "Root span",
      grow: true,
      maxWidth: 50,
      format: (t) => t.root.name,
    },
    {
      key: "spans",
      title: "Spans",
      align: "right",
      format: (t) => String(t.spans.length),
    },
    {
      key: "duration",
      title: "Duration",
      align: "right",
      width: 8,
      format: (t) => duration(t.end - t.start),
    },
    {
      key: "errors",
      title: "Errors",
      align: "right",
      format: (t) => (t.errors ? `✗ ${t.errors}` : ""),
      color: theme.danger,
    },
  ];
</script>

<box grow={1} onlayout={(e) => (height = e.height)}>
  <Table
    {columns}
    rows={traces}
    selected={index}
    height={Math.max(1, height - 2)}
    autofocus
    {emptyText}
    onchange={(_, trace) => onchange(trace)}
    onselect={(_, trace) => onopen(trace)}
  />
</box>
