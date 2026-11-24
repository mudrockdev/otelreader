import { error } from '@sveltejs/kit';
import { sleep, traced } from '#lib/server/tracing.js';
import type { PageServerLoad } from './$types';

// Always fails, to produce error spans
export const load: PageServerLoad = async () => {
	await traced('payment.charge', { 'app.amount': 42 }, async () => {
		await sleep(15);
		throw new Error('card declined');
	}).catch(() => error(502, 'Payment provider failed'));
};
