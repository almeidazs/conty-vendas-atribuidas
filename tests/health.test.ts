import { expect, test } from 'vitest';
import { request } from './helpers';

test('reports API and database health', async () => {
	const res = await request('GET', '/health');
	expect(res.status).toBe(200);
	expect(await res.json()).toEqual({ status: 'ok', database: 'ok' });
});

test('unknown routes return the error envelope', async () => {
	const res = await request('GET', '/nope');
	expect(res.status).toBe(404);
	expect(await res.json()).toMatchObject({ code: 'ROUTE_NOT_FOUND' });
});
