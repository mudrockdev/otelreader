import { afterEach, expect, test } from 'bun:test';
import { renderTest, type TestRenderer } from 'mudui/testing';
import App from '../src/App.svelte';
import { StatusCode } from '../src/otlp/types.ts';
import { TraceStore } from '../src/store.svelte.ts';
import { span } from './fixtures.ts';

const T0 = 1_700_000_000_000;

function checkout(traceId = 'a'.repeat(32), start = T0) {
	return [
		span({ traceId, spanId: '1'.repeat(16), name: 'GET /checkout', service: 'web', start, end: start + 120, kind: 2 }),
		span({
			traceId,
			spanId: '2'.repeat(16),
			parentSpanId: '1'.repeat(16),
			name: 'db.query orders',
			service: 'web',
			start: start + 10,
			end: start + 50,
			attributes: { 'db.query.text': 'SELECT * FROM orders' }
		}),
		span({
			traceId,
			spanId: '3'.repeat(16),
			parentSpanId: '1'.repeat(16),
			name: 'POST /charge',
			service: 'payments',
			start: start + 60,
			end: start + 110,
			status: { code: StatusCode.Error, message: 'card declined' }
		})
	];
}

let t: TestRenderer | undefined;
afterEach(() => t?.unmount());

function setup(receiver: { url?: string; error?: string } = { url: 'http://localhost:4318' }) {
	const store = new TraceStore();
	t = renderTest(App, { width: 140, height: 30, props: { store, receiver } });
	return { store, t };
}

test('shows traces as they arrive', () => {
	const { store, t } = setup();
	expect(t.frame()).toContain('Waiting for traces on http://localhost:4318/v1/traces');

	store.add(checkout());
	const frame = t.frame();
	expect(frame).toContain('GET /checkout');
	expect(frame).toContain('web +1'); // two services
	expect(frame).toContain('120ms');
	expect(frame).toContain('✗ 1');
	expect(frame).toContain('1 traces · 3 spans');
});

test('opens a trace, shows the tree and span details, and goes back', () => {
	const { store, t } = setup();
	store.add(checkout());

	t.press('Enter');
	let frame = t.frame();
	expect(frame).toContain('GET /checkout · 3 spans · 120ms · web, payments · 1 error');
	expect(frame).toContain('├─ db.query orders');
	expect(frame).toContain('└─ POST /charge');
	expect(frame).toContain('span id      1111111111111111'); // root selected first

	t.press('ArrowDown');
	frame = t.frame();
	expect(frame).toMatch(/db\.query\.text +SELECT \* FROM orders/);
	expect(frame).toContain('+10.0ms');

	t.press('ArrowDown');
	expect(t.frame()).toContain('error: card declined');

	t.press('Escape');
	expect(t.frame()).toContain('Root span');
});

test('folds and unfolds spans', () => {
	const { store, t } = setup();
	store.add(checkout());
	t.press('Enter');

	t.press(' ');
	expect(t.frame()).toContain('▸ GET /checkout (+2)');
	expect(t.frame()).not.toContain('db.query orders');

	t.press('ArrowRight');
	expect(t.frame()).toContain('db.query orders');
});

test('late spans show up in an open trace', () => {
	const { store, t } = setup();
	const [root] = checkout();
	store.add([root]);
	t.press('Enter');
	expect(t.frame()).toContain('1 span ·');

	store.add(checkout().slice(1));
	expect(t.frame()).toContain('3 spans');
	expect(t.frame()).toContain('POST /charge');
});

test('filters by span name, service or trace id', () => {
	const { store, t } = setup();
	store.add(checkout('a'.repeat(32), T0));
	store.add([span({ traceId: 'b'.repeat(32), spanId: '4'.repeat(16), name: 'GET /health', start: T0 + 1000 })]);
	expect(t.frame()).toContain('GET /health');

	t.press('/');
	t.type('payments');
	t.press('Enter');
	let frame = t.frame();
	expect(frame).toContain('GET /checkout');
	expect(frame).not.toContain('GET /health');
	expect(frame).toContain('1 shown');

	// Escape clears the filter
	t.press('Escape');
	expect(t.frame()).toContain('GET /health');

	t.press('/');
	t.type('bbbb');
	t.press('Enter');
	frame = t.frame();
	expect(frame).toContain('GET /health');
	expect(frame).not.toContain('GET /checkout');
});

test('typing q in the filter does not quit', () => {
	const { t } = setup();
	t.press('/');
	t.type('q');
	expect(t.app.exited).toBe(false);
	t.press('Enter');
	t.press('q');
	expect(t.app.exited).toBe(true);
});

test('shows only traces with errors', () => {
	const { store, t } = setup();
	store.add(checkout());
	store.add([span({ traceId: 'b'.repeat(32), spanId: '4'.repeat(16), name: 'GET /health', start: T0 + 1000 })]);

	t.press('e');
	const frame = t.frame();
	expect(frame).toContain('Traces with errors');
	expect(frame).toContain('GET /checkout');
	expect(frame).not.toContain('GET /health');
});

test('keeps the selection on the same trace when newer traces arrive', () => {
	const { store, t } = setup();
	store.add(checkout('a'.repeat(32), T0));
	store.add([span({ traceId: 'b'.repeat(32), spanId: '4'.repeat(16), name: 'GET /health', start: T0 + 1000 })]);

	t.press('ArrowDown'); // the older trace: GET /checkout
	store.add([span({ traceId: 'c'.repeat(32), spanId: '5'.repeat(16), name: 'GET /newest', start: T0 + 2000 })]);
	t.press('Enter');
	expect(t.frame()).toContain('GET /checkout · 3 spans');
});

test('clears traces', () => {
	const { store, t } = setup();
	store.add(checkout());
	t.press('c');
	expect(t.frame()).toContain('0 traces · 0 spans');
});

test('shows why the receiver is not running', () => {
	const { t } = setup({ error: 'port 4318 is in use, try --port' });
	expect(t.frame()).toContain('✗ port 4318 is in use, try --port');
});

test('stacks the panes on narrow terminals', () => {
	const { store, t } = setup();
	store.add(checkout());
	t.press('Enter');
	t.resize(90, 30);
	const frame = t.frame();
	expect(frame).toContain('╭─ Span ─');
	expect(frame).toContain('esc back'); // the footer is still on screen
});
