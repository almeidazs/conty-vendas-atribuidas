import { describe, expect, test } from 'vitest';
import {
	contyUtm,
	createCreator,
	type ErrorBody,
	getOrder,
	listCreators,
	type OrderResult,
	order,
	readJson,
	setup,
} from './helpers';

const withCreators = async () => {
	const api = setup();
	const ana = await createCreator(api, {
		name: 'Ana',
		utm_code: 'ana',
		coupons: ['ANA10'],
	});
	const bruno = await createCreator(api, {
		name: 'Bruno',
		utm_code: 'bruno',
		coupons: ['BRUNO15'],
	});
	return { api, ana, bruno };
};

describe('duplicated order webhooks', () => {
	test('the same order delivered twice is credited once', async () => {
		const { api, ana } = await withCreators();
		const payload = order({ discount_codes: [{ code: 'ANA10' }] });

		const first = await api.webhook('orders', payload);
		expect(first.status).toBe(201);
		expect((await readJson<OrderResult>(first)).result).toBe('credited');

		api.clock.advance(60_000);
		const second = await api.webhook('orders', payload);
		expect(second.status).toBe(200);
		const body = await readJson<OrderResult>(second);
		expect(body.result).toBe('duplicate');
		expect(body.order.sale).toMatchObject({
			totalCents: 10000,
			creator: { id: ana.id },
		});

		const [summary] = (await listCreators(api)).filter(
			(c) => c.id === ana.id,
		);
		expect(summary?.totals).toEqual([
			{
				currency: 'BRL',
				orders: 1,
				grossCents: 10000,
				refundedCents: 0,
				netCents: 10000,
			},
		]);
	});

	test('many retries of the same order never add the sale again', async () => {
		const { api, ana } = await withCreators();
		const payload = order({ discount_codes: [{ code: 'ANA10' }] });
		const statuses: number[] = [];
		for (let i = 0; i < 5; i++) {
			statuses.push((await api.webhook('orders', payload)).status);
			api.clock.advance(1000);
		}
		expect(statuses).toEqual([201, 200, 200, 200, 200]);

		const sales = await api.request('GET', `/creators/${ana.id}/sales`);
		const body = await readJson<{ pagination: { total: number } }>(sales);
		expect(body.pagination.total).toBe(1);
	});

	test('the same order id with another total or coupon is recorded as duplicate_changed and the sale stays as first credited', async () => {
		const { api, ana } = await withCreators();
		await api.webhook(
			'orders',
			order({ discount_codes: [{ code: 'ANA10' }] }),
		);
		api.clock.advance(1000);

		const res = await api.webhook(
			'orders',
			order({
				total_price: '999.99',
				discount_codes: [{ code: 'BRUNO15' }],
				utm: contyUtm('bruno'),
			}),
		);
		expect(res.status).toBe(200);
		const body = await readJson<OrderResult>(res);
		expect(body.result).toBe('duplicate_changed');
		expect(body.order.sale).toMatchObject({
			totalCents: 10000,
			creator: { id: ana.id, name: 'Ana' },
			attribution: { reason: 'coupon', coupon: 'ANA10', conflict: null },
		});
	});

	test('a later "refunded" status does not change the sale: refunds only come from the refund webhook', async () => {
		const api = setup();
		await api.webhook('orders', order());
		api.clock.advance(1000);
		const res = await api.webhook(
			'orders',
			order({ financial_status: 'refunded' }),
		);
		const body = await readJson<OrderResult>(res);
		expect(body.result).toBe('duplicate_changed');
		expect(body.order.sale).toMatchObject({
			financialStatus: 'paid',
			refundedCents: 0,
			netCents: 10000,
			attributionStatus: 'active',
		});
	});

	test('a numeric id and its string form are the same order', async () => {
		const api = setup();
		expect(
			(await api.webhook('orders', order({ id: 5551234 }))).status,
		).toBe(201);
		const res = await api.webhook('orders', order({ id: '5551234' }));
		expect(res.status).toBe(200);
		expect((await readJson<OrderResult>(res)).result).toBe(
			'duplicate_changed',
		);
		expect((await getOrder(api, '5551234')).sale?.totalCents).toBe(10000);
	});

	test('an identical body re-signed byte for byte is a plain duplicate, even with extra store fields', async () => {
		const api = setup();
		const raw = JSON.stringify({
			...order(),
			customer: { email: 'x@example.com' },
			line_items: [{ sku: 'A', quantity: 1 }],
		});
		expect((await api.webhook('orders', null, raw)).status).toBe(201);
		const res = await api.webhook('orders', null, raw);
		expect((await readJson<OrderResult>(res)).result).toBe('duplicate');
	});
});

describe('payment status', () => {
	test('a pending order is not credited and becomes a sale when the paid version arrives', async () => {
		const { api, ana } = await withCreators();
		const pending = await api.webhook(
			'orders',
			order({
				financial_status: 'pending',
				discount_codes: [{ code: 'ANA10' }],
			}),
		);
		expect(pending.status).toBe(200);
		const pendingBody = await readJson<OrderResult>(pending);
		expect(pendingBody.result).toBe('not_paid');
		expect(pendingBody.order.sale).toBeNull();

		api.clock.advance(60_000);
		const paid = await api.webhook(
			'orders',
			order({ discount_codes: [{ code: 'ANA10' }] }),
		);
		expect(paid.status).toBe(201);
		const body = await readJson<OrderResult>(paid);
		expect(body.result).toBe('credited');
		expect(body.order.sale).toMatchObject({
			creator: { id: ana.id },
			paidAt: '2026-10-10T12:01:00.000Z',
		});
		expect(body.order.events.map((e) => e.outcome)).toEqual([
			'not_paid',
			'credited',
		]);
	});

	test.each(['pending', 'authorized', 'voided', 'expired'])(
		'an order that is only "%s" is never credited',
		async (status) => {
			const { api, ana } = await withCreators();
			const res = await api.webhook(
				'orders',
				order({
					financial_status: status,
					discount_codes: [{ code: 'ANA10' }],
				}),
			);
			expect(res.status).toBe(200);
			expect((await readJson<OrderResult>(res)).result).toBe('not_paid');
			expect((await getOrder(api, '1001')).sale).toBeNull();
			const [summary] = (await listCreators(api)).filter(
				(c) => c.id === ana.id,
			);
			expect(summary?.totals).toEqual([]);
		},
	);

	test.each(['paid', 'PAID', 'partially_refunded', 'refunded'])(
		'a first delivery with status "%s" is credited',
		async (status) => {
			const api = setup();
			const res = await api.webhook(
				'orders',
				order({ financial_status: status }),
			);
			expect(res.status).toBe(201);
			expect(
				(await readJson<OrderResult>(res)).order.sale?.totalCents,
			).toBe(10000);
		},
	);

	test('a cancelled order delivered repeatedly stays uncredited', async () => {
		const api = setup();
		for (let i = 0; i < 3; i++) {
			const res = await api.webhook(
				'orders',
				order({ financial_status: 'voided' }),
			);
			expect((await readJson<OrderResult>(res)).result).toBe('not_paid');
		}
		const detail = await getOrder(api, '1001');
		expect(detail.sale).toBeNull();
		expect(detail.events).toHaveLength(3);
	});
});

describe('attribution through the API', () => {
	test('a creator coupon attributes the sale to its owner', async () => {
		const { api, ana } = await withCreators();
		const res = await api.webhook(
			'orders',
			order({ discount_codes: [{ code: 'ana10' }] }),
		);
		expect((await readJson<OrderResult>(res)).order.sale).toMatchObject({
			creator: { id: ana.id, name: 'Ana' },
			attribution: { reason: 'coupon', coupon: 'ANA10', conflict: null },
		});
	});

	test('a Conty UTM attributes the sale to the creator in utm_content', async () => {
		const { api, bruno } = await withCreators();
		const res = await api.webhook(
			'orders',
			order({ utm: contyUtm('bruno') }),
		);
		expect((await readJson<OrderResult>(res)).order.sale).toMatchObject({
			creator: { id: bruno.id, name: 'Bruno' },
			attribution: {
				reason: 'utm',
				coupon: null,
				utmContent: 'bruno',
				conflict: null,
			},
		});
	});

	test('an order with no creator coupon and no Conty UTM is a sale with no creator', async () => {
		const { api } = await withCreators();
		const res = await api.webhook(
			'orders',
			order({
				discount_codes: [{ code: 'BLACKFRIDAY' }],
				utm: { source: 'google', content: 'ana' },
			}),
		);
		expect(res.status).toBe(201);
		expect((await readJson<OrderResult>(res)).order.sale).toMatchObject({
			totalCents: 10000,
			creator: null,
			attribution: { reason: 'none', coupon: null, conflict: null },
		});
		for (const creator of await listCreators(api))
			expect(creator.totals).toEqual([]);
	});

	test('tie-break: coupon and UTM of different creators credit the coupon owner only and record the UTM creator as conflict', async () => {
		const { api, ana, bruno } = await withCreators();
		const res = await api.webhook(
			'orders',
			order({
				discount_codes: [{ code: 'ANA10' }],
				utm: contyUtm('bruno'),
			}),
		);
		expect((await readJson<OrderResult>(res)).order.sale).toMatchObject({
			creator: { id: ana.id, name: 'Ana' },
			attribution: {
				reason: 'coupon',
				coupon: 'ANA10',
				utmContent: 'bruno',
				conflict: { id: bruno.id, name: 'Bruno' },
			},
		});

		const creators = await listCreators(api);
		const totals = (id: string) =>
			creators.find((c) => c.id === id)?.totals;
		expect(totals(ana.id)).toEqual([
			{
				currency: 'BRL',
				orders: 1,
				grossCents: 10000,
				refundedCents: 0,
				netCents: 10000,
			},
		]);
		expect(totals(bruno.id)).toEqual([]);
	});

	test('the attribution uses the creators known when the order is credited and never changes afterwards', async () => {
		const api = setup();
		await api.webhook(
			'orders',
			order({ discount_codes: [{ code: 'CARLA5' }] }),
		);
		await createCreator(api, {
			name: 'Carla',
			utm_code: 'carla',
			coupons: ['CARLA5'],
		});
		api.clock.advance(1000);
		await api.webhook(
			'orders',
			order({ discount_codes: [{ code: 'CARLA5' }] }),
		);
		expect((await getOrder(api, '1001')).sale?.creator).toBeNull();
	});
});

describe('order history', () => {
	test('every delivery is kept as an event, oldest first', async () => {
		const api = setup();
		const deliveries = [
			order({ financial_status: 'pending' }),
			order(),
			order(),
			order({ total_price: '50.00' }),
		];
		for (const payload of deliveries) {
			await api.webhook('orders', payload);
			api.clock.advance(1000);
		}
		const { events } = await getOrder(api, '1001');
		expect(
			events.map(({ topic, externalId, outcome }) => ({
				topic,
				externalId,
				outcome,
			})),
		).toEqual([
			{ topic: 'orders', externalId: '1001', outcome: 'not_paid' },
			{ topic: 'orders', externalId: '1001', outcome: 'credited' },
			{ topic: 'orders', externalId: '1001', outcome: 'duplicate' },
			{
				topic: 'orders',
				externalId: '1001',
				outcome: 'duplicate_changed',
			},
		]);
		expect(events[1]?.payloadHash).toBe(events[2]?.payloadHash);
		expect(events[3]?.payloadHash).not.toBe(events[2]?.payloadHash);
		expect(events.map((e) => e.receivedAt)).toEqual([
			'2026-10-10T12:00:00.000Z',
			'2026-10-10T12:00:01.000Z',
			'2026-10-10T12:00:02.000Z',
			'2026-10-10T12:00:03.000Z',
		]);
	});

	test('an order nobody has heard of is 404', async () => {
		const api = setup();
		const res = await api.request('GET', '/orders/nope');
		expect(res.status).toBe(404);
		expect((await readJson<ErrorBody>(res)).code).toBe('ORDER_NOT_FOUND');
	});

	test('amounts are converted to integer cents without floating point errors', async () => {
		const api = setup();
		const cases: [string, string | number, number][] = [
			['a', '149.90', 14990],
			['b', 149.9, 14990],
			['c', '0.29', 29],
			['d', 1234567.89, 123456789],
			['e', '7', 700],
		];
		for (const [id, total, cents] of cases) {
			const res = await api.webhook(
				'orders',
				order({ id, total_price: total }),
			);
			expect(
				(await readJson<OrderResult>(res)).order.sale?.totalCents,
			).toBe(cents);
		}
	});
});
