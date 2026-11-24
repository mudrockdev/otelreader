import { StatusCode, type SpanData } from './otlp/types.ts';

export interface Trace {
	id: string;
	/** Sorted by start time */
	spans: SpanData[];
	/** The earliest span without a parent in this trace (or the earliest span, if all have parents) */
	root: SpanData;
	start: number;
	end: number;
	services: string[];
	errors: number;
}

function summarize(id: string, spans: SpanData[]): Trace {
	spans.sort((a, b) => a.start - b.start);
	const ids = new Set(spans.map((s) => s.spanId));
	const root =
		spans.find((s) => !s.parentSpanId) ?? spans.find((s) => !ids.has(s.parentSpanId)) ?? spans[0];
	let start = Infinity;
	let end = -Infinity;
	let errors = 0;
	const services = new Set<string>();
	for (const s of spans) {
		start = Math.min(start, s.start);
		end = Math.max(end, s.end);
		if (s.status.code === StatusCode.Error) errors++;
		services.add(s.service);
	}
	return { id, spans, root, start, end, services: [...services], errors };
}

/** Collects spans into traces. `traces` is reactive, newest first. */
export class TraceStore {
	traces: Trace[] = $state.raw([]);
	spanCount = $state(0);
	/** Payloads the receiver couldn't decode */
	rejected = $state(0);
	lastRejection = $state('');

	#spans = new Map<string, Map<string, SpanData>>();
	#summaries = new Map<string, Trace>();

	/** At most this many traces are kept; the oldest are dropped */
	constructor(public limit = 2000) {}

	add(spans: SpanData[]) {
		if (spans.length === 0) return;
		const touched = new Set<string>();
		for (const span of spans) {
			if (!span.traceId) continue;
			let trace = this.#spans.get(span.traceId);
			if (!trace) this.#spans.set(span.traceId, (trace = new Map()));
			trace.set(span.spanId, span); // a re-sent span replaces the earlier copy
			touched.add(span.traceId);
		}
		for (const id of touched) {
			this.#summaries.set(id, summarize(id, [...this.#spans.get(id)!.values()]));
		}

		let list = [...this.#summaries.values()].sort((a, b) => b.start - a.start);
		if (list.length > this.limit) {
			for (const old of list.slice(this.limit)) {
				this.#spans.delete(old.id);
				this.#summaries.delete(old.id);
			}
			list = list.slice(0, this.limit);
		}
		this.traces = list;
		this.spanCount = list.reduce((n, t) => n + t.spans.length, 0);
	}

	reject(message: string) {
		this.rejected++;
		this.lastRejection = message;
	}

	get(id: string): Trace | undefined {
		return this.traces.find((t) => t.id === id);
	}

	clear() {
		this.#spans.clear();
		this.#summaries.clear();
		this.traces = [];
		this.spanCount = 0;
	}
}
