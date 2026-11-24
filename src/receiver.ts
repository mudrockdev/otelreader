/**
 * An OTLP/HTTP receiver for traces: `POST /v1/traces` with protobuf or JSON bodies,
 * optionally gzip-compressed. Logs and metrics are accepted and ignored, so exporters
 * configured for all signals don't log errors. CORS is open for browser exporters.
 */
import { decodeTracesJson } from './otlp/json.ts';
import { decodeTracesProto } from './otlp/proto.ts';
import type { SpanData } from './otlp/types.ts';

export interface ReceiverOptions {
	port: number;
	hostname?: string;
	onSpans: (spans: SpanData[]) => void;
	/** Called for payloads that can't be decoded */
	onError?: (message: string) => void;
}

const cors = {
	'access-control-allow-origin': '*',
	'access-control-allow-methods': 'POST, OPTIONS',
	'access-control-allow-headers': '*'
};

function reply(json: boolean, status = 200, message?: string) {
	if (status !== 200) {
		return new Response(message ?? '', { status, headers: { ...cors, 'content-type': 'text/plain' } });
	}
	// an empty ExportTraceServiceResponse means everything was accepted
	return json
		? new Response('{}', { headers: { ...cors, 'content-type': 'application/json' } })
		: new Response(new Uint8Array(), { headers: { ...cors, 'content-type': 'application/x-protobuf' } });
}

export async function handleOtlpRequest(
	req: Request,
	onSpans: (spans: SpanData[]) => void,
	onError?: (message: string) => void
): Promise<Response> {
	const { pathname } = new URL(req.url);
	if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
	if (req.method === 'GET' && pathname === '/') {
		return new Response('otelreader: send OTLP traces to POST /v1/traces\n');
	}

	const type = req.headers.get('content-type') ?? '';
	const json = type.includes('json');
	const signal = pathname.replace(/\/+$/, '');
	if (req.method !== 'POST') return reply(json, 405, 'method not allowed');
	if (signal === '/v1/logs' || signal === '/v1/metrics') return reply(json);
	if (signal !== '/v1/traces') return reply(json, 404, 'not found');

	try {
		let body = new Uint8Array(await req.arrayBuffer());
		const encoding = req.headers.get('content-encoding');
		if (encoding === 'gzip') body = Bun.gunzipSync(body);
		else if (encoding && encoding !== 'identity') {
			return reply(json, 415, `unsupported content-encoding: ${encoding}`);
		}
		const spans = json
			? decodeTracesJson(JSON.parse(new TextDecoder().decode(body)))
			: decodeTracesProto(body);
		onSpans(spans);
		return reply(json);
	} catch (error) {
		const message = `bad ${json ? 'JSON' : 'protobuf'} payload: ${(error as Error).message}`;
		onError?.(message);
		return reply(json, 400, message);
	}
}

/** Starts the receiver. Throws if the port can't be bound. */
export function startReceiver({ port, hostname = '0.0.0.0', onSpans, onError }: ReceiverOptions) {
	const server = Bun.serve({
		port,
		hostname,
		fetch: (req) => handleOtlpRequest(req, onSpans, onError)
	});
	return {
		url: `http://${hostname === '0.0.0.0' ? 'localhost' : hostname}:${server.port}`,
		port: server.port,
		stop: () => server.stop(true)
	};
}
