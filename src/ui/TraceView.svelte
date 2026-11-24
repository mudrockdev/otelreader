<script lang="ts">
  import { Panel, useTerminalSize } from "mudui";
  import { duration } from "../format.ts";
  import type { Trace } from "../store.svelte.ts";
  import { flattenTrace, type TreeRow } from "../tree.ts";
  import SpanDetails from "./SpanDetails.svelte";
  import SpanTree from "./SpanTree.svelte";

  let { trace }: { trace: Trace } = $props();

  const size = useTerminalSize();
  const wide = $derived(size.columns >= 130);

  let collapsed: Set<string> = $state.raw(new Set());
  let selectedId = $state("");

  // the trace can grow while it's open, as late spans arrive
  const rows = $derived(flattenTrace(trace, collapsed));
  const selected = $derived(
    rows.find((r) => r.span.spanId === selectedId) ?? rows[0],
  );

  function toggle(row: TreeRow, expand = row.collapsed) {
    const next = new Set(collapsed);
    if (expand) next.delete(row.span.spanId);
    else next.add(row.span.spanId);
    collapsed = next;
  }

  const title = $derived(
    [
      trace.root.name,
      `${trace.spans.length} span${trace.spans.length === 1 ? "" : "s"}`,
      duration(trace.end - trace.start),
      trace.services.join(", "),
      trace.errors
        ? `${trace.errors} error${trace.errors === 1 ? "" : "s"}`
        : "",
      trace.id.slice(0, 16),
    ]
      .filter(Boolean)
      .join(" · "),
  );
</script>

<box grow={1} shrink={1} direction={wide ? "row" : "column"}>
  <Panel {title} grow={1} shrink={1} minWidth={40}>
    <SpanTree
      {trace}
      {rows}
      selectedId={selected?.span.spanId ?? ""}
      onchange={(row) => (selectedId = row.span.spanId)}
      ontoggle={toggle}
    />
  </Panel>
  {#if selected}
    <Panel
      title="Span"
      width={wide ? "40%" : undefined}
      height={wide ? undefined : "45%"}
      shrink={0}
    >
      <SpanDetails span={selected.span} {trace} />
    </Panel>
  {/if}
</box>
