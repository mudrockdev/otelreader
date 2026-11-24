<script lang="ts">
  import { ScrollView, getTheme, type ColorValue } from "mudui";
  import {
    attrValue,
    clock,
    duration,
    kindName,
    serviceColor,
  } from "../format.ts";
  import { StatusCode, type Attributes, type SpanData } from "../otlp/types.ts";
  import type { Trace } from "../store.svelte.ts";

  let { span, trace }: { span: SpanData; trace: Trace } = $props();

  const theme = getTheme();
  let offset = $state(0);

  // back to the top when another span is selected
  $effect.pre(() => {
    void span.spanId;
    offset = 0;
  });

  const entries = (attrs: Attributes) =>
    Object.entries(attrs)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => [k, attrValue(v)] as const);

  const attributes = $derived(entries(span.attributes));
  const resource = $derived(entries(span.resource));
  const keyWidth = $derived(
    Math.min(
      32,
      Math.max(
        10,
        ...[...attributes, ...resource].map(([k]) => k.length),
        ...span.events.flatMap((e) =>
          Object.keys(e.attributes).map((k) => k.length + 2),
        ),
      ),
    ),
  );

  const status = $derived(
    span.status.code === StatusCode.Error
      ? { label: "error", color: theme.danger }
      : span.status.code === StatusCode.Ok
        ? { label: "ok", color: theme.success }
        : { label: "unset", color: theme.muted },
  );
  const offsetOf = (ms: number) => `+${duration(ms - trace.start)}`;
</script>

{#snippet row(key: string, value: string, color?: ColorValue, indent = 0)}
  <box row gap={1}>
    <txt width={keyWidth} color={theme.muted} wrap="truncate"
      >{" ".repeat(indent)}{key}</txt
    >
    <txt grow={1} {color}>{value}</txt>
  </box>
{/snippet}

{#snippet heading(title: string, count?: number)}
  <txt bold color={theme.accent}
    >{title}{#if count !== undefined}<txt color={theme.muted} bold={false}
        >{` ${count}`}</txt
      >{/if}</txt
  >
{/snippet}

<ScrollView height="100%" bind:offset gap={1}>
  <box>
    <txt bold wrap="wrap">{span.name}</txt>
    <txt
      ><txt color={serviceColor(span.service)}>{span.service}</txt><txt
        color={theme.muted}
        >{` · ${kindName(span.kind)}`}{span.scope.name
          ? ` · ${span.scope.name}`
          : ""}</txt
      ></txt
    >
  </box>

  <box>
    {@render row("duration", duration(span.end - span.start))}
    {@render row("start", `${clock(span.start)}  (${offsetOf(span.start)})`)}
    {@render row(
      "status",
      span.status.message
        ? `${status.label}: ${span.status.message}`
        : status.label,
      status.color,
    )}
    {@render row("span id", span.spanId)}
    {@render row("parent id", span.parentSpanId || "—")}
    {@render row("trace id", span.traceId)}
  </box>

  <box>
    {@render heading("Attributes", attributes.length)}
    {#each attributes as [key, value] (key)}
      {@render row(key, value)}
    {:else}
      <txt color={theme.muted} italic>none</txt>
    {/each}
  </box>

  {#if span.events.length > 0}
    <box>
      {@render heading("Events", span.events.length)}
      {#each span.events as event, i (i)}
        <txt
          ><txt color={theme.muted}>{offsetOf(event.time)}</txt>{" "}<txt
            bold
            color={event.name === "exception" ? theme.danger : undefined}
            >{event.name}</txt
          ></txt
        >
        {#each entries(event.attributes) as [key, value] (key)}
          {@render row(key, value, undefined, 2)}
        {/each}
      {/each}
    </box>
  {/if}

  {#if span.links.length > 0}
    <box>
      {@render heading("Links", span.links.length)}
      {#each span.links as link, i (i)}
        {@render row("trace id", link.traceId)}
        {@render row("span id", link.spanId)}
      {/each}
    </box>
  {/if}

  <box>
    {@render heading("Resource", resource.length)}
    {#each resource as [key, value] (key)}
      {@render row(key, value)}
    {/each}
  </box>
</ScrollView>
