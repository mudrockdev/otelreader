<script lang="ts">
	import { Scrollbar, fit, getTheme, stringWidth, truncate, type KeyEvent } from 'mudui';
	import { duration, serviceColor } from '../format.ts';
	import { StatusCode } from '../otlp/types.ts';
	import type { Trace } from '../store.svelte.ts';
	import type { TreeRow } from '../tree.ts';

	let {
		trace,
		rows,
		selectedId,
		onchange,
		ontoggle
	}: {
		trace: Trace;
		rows: TreeRow[];
		selectedId: string;
		onchange: (row: TreeRow) => void;
		/** Collapse (`false`) or expand (`true`) a span; `undefined` toggles */
		ontoggle: (row: TreeRow, expand?: boolean) => void;
	} = $props();

	const theme = getTheme();
	const DURATION = 8;

	let width = $state(80);
	let height = $state(10);
	let focused = $state(false);
	let offset = $state(0);

	const index = $derived(Math.max(0, rows.findIndex((r) => r.span.spanId === selectedId)));
	/** Rows that fit below the axis header */
	const visible = $derived(Math.max(1, height - 1));
	const top = $derived.by(() => {
		let start = Math.min(offset, Math.max(0, rows.length - visible));
		if (index < start) start = index;
		if (index >= start + visible) start = index - visible + 1;
		return Math.max(0, start);
	});
	$effect.pre(() => {
		offset = top;
	});

	const scrollbar = $derived(rows.length > visible);
	const inner = $derived(width - (scrollbar ? 1 : 0) - 1); // minus the selection marker
	const nameWidth = $derived(Math.max(12, Math.min(56, Math.floor(inner * 0.42))));
	const barWidth = $derived(Math.max(4, inner - nameWidth - DURATION - 2));
	const total = $derived(Math.max(trace.end - trace.start, 1e-3));

	function bar(row: TreeRow) {
		const scale = barWidth / total;
		const from = Math.min(barWidth - 1, Math.max(0, Math.floor((row.span.start - trace.start) * scale)));
		const to = Math.min(barWidth, Math.max(from + 1, Math.ceil((row.span.end - trace.start) * scale)));
		return { before: ' '.repeat(from), fill: '█'.repeat(to - from), after: ' '.repeat(barWidth - to) };
	}

	/** `0 ··· 76ms ··· 152ms` across the bar column */
	const axis = $derived.by(() => {
		const end = duration(total);
		const mid = duration(total / 2);
		const cells = Array(barWidth).fill(' ');
		const put = (text: string, at: number) => {
			for (let i = 0; i < text.length && at + i < barWidth; i++) cells[at + i] = text[i];
		};
		put('0', 0);
		if (barWidth > end.length + mid.length + 6) put(mid, Math.floor(barWidth / 2 - mid.length / 2));
		put(end, Math.max(0, barWidth - end.length));
		return cells.join('');
	});

	function name(row: TreeRow) {
		const icon = row.collapsed ? '▸ ' : row.childCount > 0 ? '▾ ' : '';
		const prefix = truncate(row.prefix, Math.max(0, nameWidth - 6));
		const label = row.collapsed ? `${row.span.name} (+${row.childCount})` : row.span.name;
		return { prefix, text: fit(icon + label, nameWidth - stringWidth(prefix)) };
	}

	function move(delta: number) {
		if (rows.length === 0) return;
		const next = Math.max(0, Math.min(rows.length - 1, index + delta));
		if (rows[next].span.spanId !== selectedId) onchange(rows[next]);
	}

	function parent(row: TreeRow) {
		const at = rows.findIndex((r) => r.span.spanId === row.span.parentSpanId);
		if (at >= 0) onchange(rows[at]);
	}

	function onkeydown(event: KeyEvent) {
		const row = rows[index];
		const k = event.key;
		if (k === 'ArrowUp' || event.is('k')) move(-1);
		else if (k === 'ArrowDown' || event.is('j')) move(1);
		else if (k === 'PageUp') move(-visible);
		else if (k === 'PageDown') move(visible);
		else if (k === 'Home' || event.is('g')) move(-rows.length);
		else if (k === 'End' || event.is('G')) move(rows.length);
		else if (!row) return;
		else if (k === 'Enter' || k === ' ') {
			if (row.childCount > 0) ontoggle(row);
		} else if (k === 'ArrowLeft' || event.is('h')) {
			if (row.childCount > 0 && !row.collapsed) ontoggle(row, false);
			else parent(row);
		} else if (k === 'ArrowRight' || event.is('l')) {
			if (row.collapsed) ontoggle(row, true);
			else move(1);
		} else return;
		event.preventDefault();
		event.stopPropagation();
	}

	function click(row: TreeRow, event: { localX: number }) {
		if (row.span.spanId === selectedId && row.childCount > 0 && event.localX < nameWidth + 1) {
			ontoggle(row);
		} else onchange(row);
	}
</script>

<box
	grow={1}
	focusable
	autofocus
	onfocus={() => (focused = true)}
	onblur={() => (focused = false)}
	onlayout={(e) => ((width = e.width), (height = e.height))}
	{onkeydown}
	onwheel={(e) => move(e.deltaY)}
>
	<txt wrap="none" bold
		>{' '}{fit('Span', nameWidth)}{' '}{fit('Duration', DURATION, 'right')}{' '}<txt
			color={theme.muted}
			bold={false}>{axis}</txt
		></txt
	>
	<box row grow={1}>
		<box grow={1}>
			{#each rows.slice(top, top + visible) as row, i (row.span.spanId)}
				{@const active = i + top === index}
				{@const n = name(row)}
				{@const b = bar(row)}
				{@const error = row.span.status.code === StatusCode.Error}
				{@const highlight = active && focused}
				<txt
					wrap="none"
					onclick={(e) => click(row, e)}
					bg={active ? (focused ? theme.accent : theme.surface) : undefined}
					color={highlight ? theme.onAccent : undefined}
					bold={active}
					>{active ? '▌' : ' '}<txt color={highlight ? undefined : theme.muted} bold={false}
						>{n.prefix}</txt
					><txt color={highlight ? undefined : error ? theme.danger : undefined}>{n.text}</txt
					>{' '}<txt color={highlight ? undefined : theme.muted}
						>{fit(duration(row.span.end - row.span.start), DURATION, 'right')}</txt
					>{' '}{b.before}<txt
						color={highlight ? undefined : error ? theme.danger : serviceColor(row.span.service)}
						>{b.fill}</txt
					>{b.after}</txt
				>
			{/each}
		</box>
		{#if scrollbar}
			<Scrollbar total={rows.length} {visible} offset={top} height={visible} />
		{/if}
	</box>
</box>
