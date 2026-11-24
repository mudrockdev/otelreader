<script lang="ts">
	import { KeyHints, Panel, TextInput, getTheme, useApp, useInput } from 'mudui';
	import type { Trace, TraceStore } from './store.svelte.ts';
	import TraceList from './ui/TraceList.svelte';
	import TraceView from './ui/TraceView.svelte';

	let {
		store,
		receiver
	}: {
		store: TraceStore;
		/** Where the OTLP receiver listens, or why it isn't running */
		receiver: { url?: string; error?: string };
	} = $props();

	const app = useApp();
	const theme = getTheme();

	let openId = $state('');
	let selectedId = $state('');
	let filter = $state('');
	let filtering = $state(false);
	let errorsOnly = $state(false);

	const open = $derived(openId ? store.get(openId) : undefined);

	function matches(trace: Trace, text: string) {
		if (trace.id.startsWith(text)) return true;
		return trace.spans.some(
			(s) => s.name.toLowerCase().includes(text) || s.service.toLowerCase().includes(text)
		);
	}

	const visible = $derived.by(() => {
		const text = filter.trim().toLowerCase();
		return store.traces.filter((t) => (!errorsOnly || t.errors > 0) && (!text || matches(t, text)));
	});

	const emptyText = $derived(
		store.traces.length === 0
			? receiver.url
				? `Waiting for traces on ${receiver.url}/v1/traces …`
				: 'No traces'
			: 'No traces match the filter'
	);

	useInput((event) => {
		if (filtering) return;
		if (event.is('q')) app.exit();
		else if (open && (event.key === 'Escape' || event.key === 'Backspace')) openId = '';
		else if (open) return;
		else if (event.is('/')) filtering = true;
		else if (event.is('e')) errorsOnly = !errorsOnly;
		else if (event.is('c')) {
			store.clear();
			selectedId = '';
		} else if (event.key === 'Escape' && filter) filter = '';
		else return;
		event.preventDefault();
	});

	const listHints = $derived({
		'↑↓': 'select',
		enter: 'open',
		'/': filter ? `filter: ${filter}` : 'filter',
		e: errorsOnly ? 'all traces' : 'errors only',
		c: 'clear',
		q: 'quit'
	});
	const traceHints = { '↑↓': 'move', '←→ space': 'fold', tab: 'details', esc: 'back', q: 'quit' };
</script>

<box height="100%">
	<box row paddingX={1} gap={2}>
		<txt bold color={theme.accent}>◆ otelreader</txt>
		{#if receiver.url}
			<txt color={theme.success}>● <txt color="default">{receiver.url}</txt></txt>
		{:else if receiver.error}
			<txt color={theme.danger} wrap="truncate">✗ {receiver.error}</txt>
		{/if}
		<box grow={1}></box>
		{#if store.rejected > 0}
			<txt color={theme.warning} wrap="truncate">{store.rejected} bad payload{store.rejected === 1 ? '' : 's'}</txt>
		{/if}
		<txt color={theme.muted}
			>{store.traces.length} traces · {store.spanCount} spans{errorsOnly || filter
				? ` · ${visible.length} shown`
				: ''}</txt
		>
	</box>

	{#if open}
		<TraceView trace={open} />
	{:else}
		<Panel title={errorsOnly ? 'Traces with errors' : 'Traces'} grow={1} shrink={1}>
			<TraceList
				traces={visible}
				{selectedId}
				{emptyText}
				onchange={(t) => (selectedId = t.id)}
				onopen={(t) => ((selectedId = t.id), (openId = t.id))}
			/>
		</Panel>
	{/if}

	<box paddingX={1}>
		{#if filtering}
			<TextInput
				bind:value={filter}
				prefix="/ "
				placeholder="span name, service or trace id"
				autofocus
				onsubmit={() => (filtering = false)}
				oncancel={() => ((filter = ''), (filtering = false))}
			/>
		{:else}
			<KeyHints hints={open ? traceHints : listHints} />
		{/if}
	</box>
</box>
