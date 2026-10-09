import { describe, expect, test } from 'vitest';
import { sign } from '../src/lib/signature';
import {
	type ErrorBody,
	getOrder,
	order,
	readJson,
	refund,
	setup,
	WEBHOOK_SECRET,
} from './helpers';

const topics = ['orders', 'refunds'] as const;
const payloads = { orders: order(), refunds: refund() };

const expectNothingStored = async (api: ReturnType<typeof setup>) => {
	const res = await api.request('GET', '/orders/1001');
	expect(res.status).toBe(404);
};

describe.each(topics)('signature on /webhooks/%s', (topic) => {
	const body = JSON.stringify(payloads[topic]);
	const post = (
		api: ReturnType<typeof setup>,
		headers: Record<string, string>,
		raw = body,
	) => api.request('POST', `/webhooks/${topic}`, { raw, headers });

	test('a request without signature is rejected with 401 and stores nothing', async () => {
		const api = setup();
		const res = await post(api, {});
		expect(res.status).toBe(401);
		expect((await readJson<ErrorBody>(res)).code).toBe('INVALID_SIGNATURE');
		await expectNothingStored(api);
	});

	test.each([
		['garbage', 'not-base64-%%%'],
		['empty', ''],
		['signed with another secret', 'placeholder'],
	])('a %s signature is rejected with 401', async (_, signature) => {
		const api = setup();
		const value =
			signature === 'placeholder'
				? await sign('other-secret', body)
				: signature;
		const res = await post(api, { 'x-webhook-signature': value });
		expect(res.status).toBe(401);
		await expectNothingStored(api);
	});

	test('the signature of a different body is rejected with 401', async () => {
		const api = setup();
		const other = JSON.stringify({ ...payloads[topic], id: '999' });
		const res = await post(api, {
			'x-webhook-signature': await sign(WEBHOOK_SECRET, other),
		});
		expect(res.status).toBe(401);
	});

	test('a validly signed body that is modified in transit is rejected with 401', async () => {
		const api = setup();
		const signature = await sign(WEBHOOK_SECRET, body);
		const tampered = body.replace('"1001"', '"1002"');
		expect(tampered).not.toBe(body);
		const res = await post(
			api,
			{ 'x-webhook-signature': signature },
			tampered,
		);
		expect(res.status).toBe(401);
		await expectNothingStored(api);
	});

	test('reformatting the JSON (same data, other bytes) breaks the signature', async () => {
		const api = setup();
		const signature = await sign(WEBHOOK_SECRET, body);
		const res = await post(
			api,
			{ 'x-webhook-signature': signature },
			JSON.stringify(payloads[topic], null, 2),
		);
		expect(res.status).toBe(401);
	});

	test('the signature is checked before the content type', async () => {
		const api = setup();
		const res = await post(api, { 'content-type': 'text/plain' });
		expect(res.status).toBe(401);
	});

	test('a signed body that is not application/json is rejected with 415', async () => {
		const api = setup();
		const res = await post(api, {
			'content-type': 'text/plain',
			'x-webhook-signature': await sign(WEBHOOK_SECRET, body),
		});
		expect(res.status).toBe(415);
		expect((await readJson<ErrorBody>(res)).code).toBe(
			'UNSUPPORTED_MEDIA_TYPE',
		);
	});

	test('signed malformed JSON is rejected with 400', async () => {
		const api = setup();
		const res = await api.webhook(topic, null, '{"id": "1001",');
		expect(res.status).toBe(400);
		expect((await readJson<ErrorBody>(res)).code).toBe('BAD_REQUEST');
	});
});

describe('payload validation', () => {
	const expectInvalid = async (res: Response) => {
		expect(res.status).toBe(400);
		expect((await readJson<ErrorBody>(res)).code).toBe('VALIDATION_FAILED');
	};

	test.each([
		'1.234',
		'-1',
		'-1.00',
		'abc',
		'',
		'1,50',
		'1e3',
		'Infinity',
		'10.',
		0.1 + 0.2,
		-5,
		1.005,
	])('order total %j is rejected', async (total) => {
		const api = setup();
		await expectInvalid(
			await api.webhook('orders', order({ total_price: total })),
		);
		expect((await api.request('GET', '/orders/1001')).status).toBe(404);
	});

	test.each(['1.234', '-10.00', 'abc', 0.1 + 0.2])(
		'refund amount %j is rejected',
		async (amount) => {
			const api = setup();
			await expectInvalid(
				await api.webhook('refunds', refund({ amount })),
			);
		},
	);

	test.each(['BR', 'REAL', 'R$1', '123', ''])(
		'currency %j is rejected',
		async (currency) => {
			const api = setup();
			await expectInvalid(
				await api.webhook('orders', order({ currency })),
			);
			await expectInvalid(
				await api.webhook('refunds', refund({ currency })),
			);
		},
	);

	test('a lower-case currency is accepted and stored upper-case', async () => {
		const api = setup();
		const res = await api.webhook('orders', order({ currency: 'brl' }));
		expect(res.status).toBe(201);
		expect(
			(await readJson<{ order: { sale: { currency: string } } }>(res))
				.order.sale.currency,
		).toBe('BRL');
	});

	test('NUL characters are rejected instead of reaching the database', async () => {
		const api = setup();
		await expectInvalid(
			await api.webhook('orders', order({ id: 'a\u0000b' })),
		);
		await expectInvalid(
			await api.webhook(
				'orders',
				order({ discount_codes: [{ code: 'ANA\u000010' }] }),
			),
		);
		await expectInvalid(
			await api.webhook(
				'orders',
				order({ utm: { source: 'conty', content: 'ana\u0000' } }),
			),
		);
	});

	test.each([
		['missing id', { id: undefined }],
		['blank id', { id: '   ' }],
		['negative numeric id', { id: -1 }],
		['fractional numeric id', { id: 1.5 }],
		['missing status', { financial_status: undefined }],
		['discount_codes not a list', { discount_codes: 'ANA10' }],
	])('an order with %s is rejected', async (_, overrides) => {
		const api = setup();
		await expectInvalid(
			await api.webhook('orders', { ...order(), ...overrides }),
		);
	});

	test('a refund with an invalid created_at is rejected', async () => {
		const api = setup();
		await expectInvalid(
			await api.webhook('refunds', refund({ created_at: 'yesterday' })),
		);
	});

	test('a refund without order_id is rejected', async () => {
		const api = setup();
		await expectInvalid(
			await api.webhook('refunds', { ...refund(), order_id: undefined }),
		);
	});
});

describe('values the database cannot store', () => {
	test('an extra utm field with a NUL character is not stored and does not fail', async () => {
		const api = setup();
		const res = await api.webhook('orders', {
			...order(),
			utm: { source: 'conty', content: 'nobody', landing: 'x\u0000y' },
		});
		expect(res.status).toBe(201);
		const detail = await getOrder(api, '1001');
		expect(detail.sale?.totalCents).toBe(10000);
	});

	test('a NUL character in the order id path is rejected with 400', async () => {
		const api = setup();
		const res = await api.request('GET', '/orders/10%0001');
		expect(res.status).toBe(400);
	});
});
