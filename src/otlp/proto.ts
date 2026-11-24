/**
 * A small decoder for OTLP trace protobufs (`ExportTraceServiceRequest`, which has
 * the same layout as `TracesData`). Field numbers follow
 * opentelemetry/proto/{trace,common,resource}/v1/*.proto. Unknown fields are skipped.
 */
import {
	hex,
	int64,
	nanosToMillis,
	spanKind,
	statusCode,
	withResource,
	type PartialSpan
} from './common.ts';
import type { AttrValue, Attributes, SpanData, SpanEvent, SpanLink } from './types.ts';

const enum Wire {
	Varint = 0,
	Fixed64 = 1,
	Len = 2,
	Fixed32 = 5
}

const utf8 = new TextDecoder();

class Reader {
	pos = 0;
	end: number;
	view: DataView;

	constructor(
		public buf: Uint8Array,
		start = 0,
		end = buf.length
	) {
		this.pos = start;
		this.end = end;
		this.view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
	}

	get done() {
		return this.pos >= this.end;
	}

	varint(): bigint {
		let result = 0n;
		let shift = 0n;
		for (;;) {
			if (this.pos >= this.end) throw new Error('truncated varint');
			const byte = this.buf[this.pos++];
			result |= BigInt(byte & 0x7f) << shift;
			if (!(byte & 0x80)) return result;
			shift += 7n;
			if (shift > 63n) throw new Error('varint too long');
		}
	}

	/** A varint known to be small (tags, lengths, enums) */
	uint(): number {
		let result = 0;
		let shift = 0;
		for (;;) {
			if (this.pos >= this.end) throw new Error('truncated varint');
			const byte = this.buf[this.pos++];
			if (shift < 28) result |= (byte & 0x7f) << shift;
			else result += (byte & 0x7f) * 2 ** shift;
			if (!(byte & 0x80)) return result;
			shift += 7;
			if (shift > 63) throw new Error('varint too long');
		}
	}

	fixed64(): bigint {
		this.need(8);
		const value = this.view.getBigUint64(this.pos, true);
		this.pos += 8;
		return value;
	}

	double(): number {
		this.need(8);
		const value = this.view.getFloat64(this.pos, true);
		this.pos += 8;
		return value;
	}

	/** Reads a length-delimited field and returns a reader over it */
	sub(): Reader {
		const length = this.uint();
		this.need(length);
		const reader = new Reader(this.buf, this.pos, this.pos + length);
		this.pos += length;
		return reader;
	}

	bytes(): Uint8Array {
		const length = this.uint();
		this.need(length);
		const out = this.buf.subarray(this.pos, this.pos + length);
		this.pos += length;
		return out;
	}

	string(): string {
		return utf8.decode(this.bytes());
	}

	skip(wire: number) {
		if (wire === Wire.Varint) this.varint();
		else if (wire === Wire.Fixed64) this.need(8), (this.pos += 8);
		else if (wire === Wire.Len) this.pos += this.uint();
		else if (wire === Wire.Fixed32) this.need(4), (this.pos += 4);
		else throw new Error(`unsupported wire type ${wire}`);
		if (this.pos > this.end) throw new Error('truncated field');
	}

	/** Iterates over the fields of this message: `[field number, wire type]` */
	*fields(): Generator<[number, number]> {
		while (this.pos < this.end) {
			const tag = this.uint();
			yield [tag >>> 3, tag & 7];
		}
	}

	private need(n: number) {
		if (this.pos + n > this.end) throw new Error('truncated message');
	}
}

function anyValue(r: Reader): AttrValue {
	let value: AttrValue = null;
	for (const [field, wire] of r.fields()) {
		if (field === 1 && wire === Wire.Len) value = r.string();
		else if (field === 2 && wire === Wire.Varint) value = r.varint() !== 0n;
		else if (field === 3 && wire === Wire.Varint) value = int64(BigInt.asIntN(64, r.varint()));
		else if (field === 4 && wire === Wire.Fixed64) value = r.double();
		else if (field === 5 && wire === Wire.Len) {
			const list: AttrValue[] = [];
			const array = r.sub();
			for (const [f, w] of array.fields()) {
				if (f === 1 && w === Wire.Len) list.push(anyValue(array.sub()));
				else array.skip(w);
			}
			value = list;
		} else if (field === 6 && wire === Wire.Len) {
			const kvlist = r.sub();
			const obj: Attributes = {};
			for (const [f, w] of kvlist.fields()) {
				if (f === 1 && w === Wire.Len) keyValue(kvlist.sub(), obj);
				else kvlist.skip(w);
			}
			value = obj;
		} else if (field === 7 && wire === Wire.Len) value = r.bytes().slice();
		else r.skip(wire);
	}
	return value;
}

function keyValue(r: Reader, into: Attributes) {
	let key = '';
	let value: AttrValue = null;
	for (const [field, wire] of r.fields()) {
		if (field === 1 && wire === Wire.Len) key = r.string();
		else if (field === 2 && wire === Wire.Len) value = anyValue(r.sub());
		else r.skip(wire);
	}
	into[key] = value;
}

function event(r: Reader): SpanEvent {
	const e: SpanEvent = { name: '', time: 0, attributes: {} };
	for (const [field, wire] of r.fields()) {
		if (field === 1 && wire === Wire.Fixed64) e.time = nanosToMillis(r.fixed64());
		else if (field === 2 && wire === Wire.Len) e.name = r.string();
		else if (field === 3 && wire === Wire.Len) keyValue(r.sub(), e.attributes);
		else r.skip(wire);
	}
	return e;
}

function link(r: Reader): SpanLink {
	const l: SpanLink = { traceId: '', spanId: '', attributes: {} };
	for (const [field, wire] of r.fields()) {
		if (field === 1 && wire === Wire.Len) l.traceId = hex(r.bytes());
		else if (field === 2 && wire === Wire.Len) l.spanId = hex(r.bytes());
		else if (field === 4 && wire === Wire.Len) keyValue(r.sub(), l.attributes);
		else r.skip(wire);
	}
	return l;
}

function span(r: Reader): PartialSpan {
	const s: PartialSpan = {
		traceId: '',
		spanId: '',
		parentSpanId: '',
		name: '',
		kind: 0,
		start: 0,
		end: 0,
		attributes: {},
		events: [],
		links: [],
		status: { code: 0, message: '' }
	};
	for (const [field, wire] of r.fields()) {
		if (wire === Wire.Len) {
			if (field === 1) s.traceId = hex(r.bytes());
			else if (field === 2) s.spanId = hex(r.bytes());
			else if (field === 4) s.parentSpanId = hex(r.bytes());
			else if (field === 5) s.name = r.string();
			else if (field === 9) keyValue(r.sub(), s.attributes);
			else if (field === 11) s.events.push(event(r.sub()));
			else if (field === 13) s.links.push(link(r.sub()));
			else if (field === 15) {
				const status = r.sub();
				for (const [f, w] of status.fields()) {
					if (f === 2 && w === Wire.Len) s.status.message = status.string();
					else if (f === 3 && w === Wire.Varint) s.status.code = statusCode(status.uint());
					else status.skip(w);
				}
			} else r.skip(wire);
		} else if (field === 6 && wire === Wire.Varint) s.kind = spanKind(r.uint());
		else if (field === 7 && wire === Wire.Fixed64) s.start = nanosToMillis(r.fixed64());
		else if (field === 8 && wire === Wire.Fixed64) s.end = nanosToMillis(r.fixed64());
		else r.skip(wire);
	}
	return s;
}

/** Decodes an `ExportTraceServiceRequest` / `TracesData` protobuf into spans */
export function decodeTracesProto(buf: Uint8Array): SpanData[] {
	const out: SpanData[] = [];
	const root = new Reader(buf);
	for (const [field, wire] of root.fields()) {
		if (field !== 1 || wire !== Wire.Len) {
			root.skip(wire);
			continue;
		}
		// ResourceSpans
		const rs = root.sub();
		const resource: Attributes = {};
		const scopes: Reader[] = [];
		for (const [f, w] of rs.fields()) {
			if (f === 1 && w === Wire.Len) {
				const res = rs.sub();
				for (const [rf, rw] of res.fields()) {
					if (rf === 1 && rw === Wire.Len) keyValue(res.sub(), resource);
					else res.skip(rw);
				}
			} else if (f === 2 && w === Wire.Len) scopes.push(rs.sub());
			else rs.skip(w);
		}
		// the resource may come after the scope spans on the wire, so decode those second
		for (const ss of scopes) {
			const scope = { name: '', version: '' };
			const spans: PartialSpan[] = [];
			for (const [f, w] of ss.fields()) {
				if (f === 1 && w === Wire.Len) {
					const sc = ss.sub();
					for (const [sf, sw] of sc.fields()) {
						if (sf === 1 && sw === Wire.Len) scope.name = sc.string();
						else if (sf === 2 && sw === Wire.Len) scope.version = sc.string();
						else sc.skip(sw);
					}
				} else if (f === 2 && w === Wire.Len) spans.push(span(ss.sub()));
				else ss.skip(w);
			}
			for (const s of spans) out.push(withResource(s, resource, scope));
		}
	}
	return out;
}
