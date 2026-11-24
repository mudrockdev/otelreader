import type { Trace } from './store.svelte.ts';
import type { SpanData } from './otlp/types.ts';

export interface TreeRow {
	span: SpanData;
	depth: number;
	/** Tree guides drawn before the name, e.g. `│  ├─ ` */
	prefix: string;
	childCount: number;
	collapsed: boolean;
}

/**
 * Flattens a trace into rows in tree order (children sorted by start time).
 * Spans whose parent isn't in the trace (yet) are shown as roots.
 */
export function flattenTrace(trace: Trace, collapsed: ReadonlySet<string> = new Set()): TreeRow[] {
	const ids = new Set(trace.spans.map((s) => s.spanId));
	const children = new Map<string, SpanData[]>();
	const roots: SpanData[] = [];
	for (const span of trace.spans) {
		if (span.parentSpanId && ids.has(span.parentSpanId) && span.parentSpanId !== span.spanId) {
			const list = children.get(span.parentSpanId);
			if (list) list.push(span);
			else children.set(span.parentSpanId, [span]);
		} else roots.push(span);
	}

	const rows: TreeRow[] = [];
	const seen = new Set<string>();
	const visit = (span: SpanData, depth: number, guides: string, last: boolean, top: boolean) => {
		if (seen.has(span.spanId)) return; // guard against cycles in malformed data
		seen.add(span.spanId);
		const kids = children.get(span.spanId) ?? [];
		const isCollapsed = collapsed.has(span.spanId) && kids.length > 0;
		rows.push({
			span,
			depth,
			prefix: top ? '' : guides + (last ? '└─ ' : '├─ '),
			childCount: kids.length,
			collapsed: isCollapsed
		});
		if (isCollapsed) return;
		const next = top ? '' : guides + (last ? '   ' : '│  ');
		kids.forEach((kid, i) => visit(kid, depth + 1, next, i === kids.length - 1, false));
	};
	for (const root of roots) visit(root, 0, '', true, true);
	return rows;
}
