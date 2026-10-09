import { describe, expect, test } from 'vitest';
import {
	createCreator,
	type ErrorBody,
	getOrder,
	listCreators,
	type OrderResult,
	order,
	type RefundResult,
	readJson,
	refund,
	setup,
	sumApplied,
} from './helpers';

const paidOrder = async (total = '100.00') => {
	const api = setup();
	const ana = await createCreator(api, {
		name: 'Ana',
		utm_code: 'ana',
		coupons: ['ANA10'],
	});
	const res = await api.webhook(
		'orders',
		order({ total_price: total, discount_codes: [{ code: 'ANA10' }] }),
	);
	expect(res.status).toBe(201);
	api.clock.advance(1000);
	return { api, ana };
};

const send = async (
	api: ReturnType<typeof setup>,
	overrides: Parameters<typeof refund>[0],
) => {
	const res = await api.webhook('refunds', refund(overrides));
	api.clock.advance(1000);
	return { status: res.status, body: await readJson<RefundResult>(res) };
};

describe('refund after the order', () => {
	test('a partial refund takes only its amount from the sale', async () => {
		const { api, ana } = await paidOrder();
		const { status, body } = await send(api, { amount: '30.00' });

		expect(status).toBe(200);
		expect(body.result).toBe('applied');
		expect(body.refund).toMatchObject({
			id: 'rf_1',
			status: 'applied',
			requestedCents: 3000,
			appliedCents: 3000,
			excessCents: 0,
		});
		expect(body.order.sale).toMatchObject({
			totalCents: 10000,
			refundedCents: 3000,
			netCents: 7000,
			attributionStatus: 'partially_refunded',
			creator: { id: ana.id },
		});
	});

	test('several partial refunds accumulate', async () => {
		const { api } = await paidOrder();
		await send(api, { id: 'rf_1', amount: '10.00' });
		await send(api, { id: 'rf_2', amount: '15.50' });
		const { body } = await send(api, { id: 'rf_3', amount: 20 });

		expect(body.order.sale).toMatchObject({
			refundedCents: 4550,
			netCents: 5450,
			attributionStatus: 'partially_refunded',
		});
		expect(body.order.refunds.map((r) => r.appliedCents)).toEqual([
			1000, 1550, 2000,
		]);
	});

	test('the same refund delivered again is not applied twice', async () => {
		const { api } = await paidOrder();
		await send(api, { amount: '30.00' });
		const again = await send(api, { amount: '30.00' });

		expect(again.status).toBe(200);
		expect(again.body.result).toBe('duplicate');
		expect(again.body.order.sale).toMatchObject({
			refundedCents: 3000,
			netCents: 7000,
		});
		expect(again.body.order.refunds).toHaveLength(1);
	});

	test('a refund id seen before with a different body is duplicate_changed and the first version stays', async () => {
		const { api } = await paidOrder();
		await send(api, { amount: '30.00' });
		const changed = await send(api, { amount: '90.00' });

		expect(changed.status).toBe(200);
		expect(changed.body.result).toBe('duplicate_changed');
		expect(changed.body.refund).toMatchObject({
			requestedCents: 3000,
			appliedCents: 3000,
		});
		expect(changed.body.order.sale?.refundedCents).toBe(3000);
	});

	test('a refund above what is left is capped, keeps the excess visible and reverses the attribution', async () => {
		const { api } = await paidOrder();
		await send(api, { id: 'rf_1', amount: '70.00' });
		const { body } = await send(api, { id: 'rf_2', amount: '50.00' });

		expect(body.result).toBe('applied');
		expect(body.refund).toMatchObject({
			requestedCents: 5000,
			appliedCents: 3000,
			excessCents: 2000,
		});
		expect(body.order.sale).toMatchObject({
			refundedCents: 10000,
			netCents: 0,
			attributionStatus: 'reversed',
		});
	});

	test('a refund on a sale that is already fully refunded applies nothing but is still recorded', async () => {
		const { api } = await paidOrder();
		await send(api, { id: 'rf_1', amount: '100.00' });
		const { status, body } = await send(api, {
			id: 'rf_2',
			amount: '1.00',
		});

		expect(status).toBe(200);
		expect(body.refund).toMatchObject({
			status: 'applied',
			requestedCents: 100,
			appliedCents: 0,
			excessCents: 100,
		});
		expect(body.order.sale?.refundedCents).toBe(10000);
		expect(body.order.refunds).toHaveLength(2);
	});

	test('a full refund reverses the attribution without deleting the sale or the creator', async () => {
		const { api, ana } = await paidOrder();
		const { body } = await send(api, {
			amount: '100.00',
			created_at: '2026-10-12T15:00:00Z',
		});

		expect(body.order.sale).toMatchObject({
			totalCents: 10000,
			refundedCents: 10000,
			netCents: 0,
			attributionStatus: 'reversed',
			creator: { id: ana.id, name: 'Ana' },
			attribution: { reason: 'coupon', coupon: 'ANA10' },
		});
		expect(body.refund).toMatchObject({
			refundedAt: '2026-10-12T15:00:00.000Z',
			appliedAt: '2026-10-10T12:00:01.000Z',
		});

		const detail = await getOrder(api, '1001');
		expect(detail.events.map((e) => [e.topic, e.outcome])).toEqual([
			['orders', 'credited'],
			['refunds', 'applied'],
		]);

		const sales = await api.request('GET', `/creators/${ana.id}/sales`);
		const page = await readJson<{
			data: {
				orderId: string;
				attributionStatus: string;
				netCents: number;
			}[];
		}>(sales);
		expect(page.data).toEqual([
			expect.objectContaining({
				orderId: '1001',
				attributionStatus: 'reversed',
				netCents: 0,
			}),
		]);
	});

	test('creator totals show gross, refunded and net separately', async () => {
		const { api, ana } = await paidOrder();
		await api.webhook(
			'orders',
			order({
				id: '1002',
				total_price: '50.00',
				discount_codes: [{ code: 'ANA10' }],
			}),
		);
		await send(api, { id: 'rf_1', amount: '30.00' });
		await send(api, { id: 'rf_2', order_id: '1002', amount: '80.00' });

		const summary = (await listCreators(api)).find((c) => c.id === ana.id);
		expect(summary?.totals).toEqual([
			{
				currency: 'BRL',
				orders: 2,
				grossCents: 15000,
				refundedCents: 8000,
				netCents: 7000,
			},
		]);
	});
});

describe('refund before the order', () => {
	test('a refund for an unknown order is accepted as pending and not lost', async () => {
		const api = setup();
		const { status, body } = await send(api, { amount: '40.00' });

		expect(status).toBe(202);
		expect(body.result).toBe('pending');
		expect(body.refund).toMatchObject({
			status: 'pending',
			requestedCents: 4000,
			appliedCents: null,
			excessCents: null,
			appliedAt: null,
		});
		expect(body.order.sale).toBeNull();

		const detail = await getOrder(api, '1001');
		expect(detail.sale).toBeNull();
		expect(detail.refunds.map((r) => r.status)).toEqual(['pending']);
	});

	test('the pending refund is applied when the paid order arrives', async () => {
		const api = setup();
		await createCreator(api, {
			name: 'Ana',
			utm_code: 'ana',
			coupons: ['ANA10'],
		});
		await send(api, { amount: '40.00' });

		const res = await api.webhook(
			'orders',
			order({ discount_codes: [{ code: 'ANA10' }] }),
		);
		expect(res.status).toBe(201);
		const body = await readJson<OrderResult>(res);
		expect(body.order.sale).toMatchObject({
			totalCents: 10000,
			refundedCents: 4000,
			netCents: 6000,
			attributionStatus: 'partially_refunded',
		});
		expect(body.order.refunds).toEqual([
			expect.objectContaining({
				id: 'rf_1',
				status: 'applied',
				appliedCents: 4000,
				receivedAt: '2026-10-10T12:00:00.000Z',
				appliedAt: '2026-10-10T12:00:01.000Z',
			}),
		]);
	});

	test('a pending refund repeated before the order arrives is applied once', async () => {
		const api = setup();
		expect((await send(api, { amount: '40.00' })).status).toBe(202);
		const again = await send(api, { amount: '40.00' });
		expect(again.status).toBe(200);
		expect(again.body.result).toBe('duplicate');

		await api.webhook('orders', order());
		expect((await getOrder(api, '1001')).sale?.refundedCents).toBe(4000);
	});

	test('several early refunds are applied in arrival order and capped at the total', async () => {
		const api = setup();
		await send(api, { id: 'rf_c', amount: '60.00' });
		await send(api, { id: 'rf_a', amount: '30.00' });
		await send(api, { id: 'rf_b', amount: '25.00' });

		await api.webhook('orders', order());
		const { sale, refunds } = await getOrder(api, '1001');

		expect(
			refunds.map(({ id, appliedCents, excessCents }) => ({
				id,
				appliedCents,
				excessCents,
			})),
		).toEqual([
			{ id: 'rf_c', appliedCents: 6000, excessCents: 0 },
			{ id: 'rf_a', appliedCents: 3000, excessCents: 0 },
			{ id: 'rf_b', appliedCents: 1000, excessCents: 1500 },
		]);
		expect(sale).toMatchObject({
			refundedCents: 10000,
			netCents: 0,
			attributionStatus: 'reversed',
		});
	});

	test('early refunds received in the same millisecond are still applied in arrival order', async () => {
		const api = setup();
		await api.webhook('refunds', refund({ id: 'rf_z', amount: '80.00' }));
		await api.webhook('refunds', refund({ id: 'rf_a', amount: '80.00' }));

		await api.webhook('orders', order());
		const { refunds } = await getOrder(api, '1001');
		expect(refunds.map((r) => [r.id, r.appliedCents])).toEqual([
			['rf_z', 8000],
			['rf_a', 2000],
		]);
	});

	test('an early refund stays pending while the order is not paid and is applied when it is', async () => {
		const api = setup();
		await send(api, { amount: '40.00' });

		await api.webhook('orders', order({ financial_status: 'pending' }));
		api.clock.advance(1000);
		let detail = await getOrder(api, '1001');
		expect(detail.sale).toBeNull();
		expect(detail.refunds[0]?.status).toBe('pending');

		await api.webhook('orders', order());
		detail = await getOrder(api, '1001');
		expect(detail.refunds[0]).toMatchObject({
			status: 'applied',
			appliedCents: 4000,
		});
		expect(detail.sale?.netCents).toBe(6000);
		expect(detail.events.map((e) => [e.topic, e.outcome])).toEqual([
			['refunds', 'pending'],
			['orders', 'not_paid'],
			['orders', 'credited'],
		]);
	});

	test('an order delivered twice after an early refund applies the refund only once', async () => {
		const api = setup();
		await send(api, { amount: '40.00' });
		await api.webhook('orders', order());
		api.clock.advance(1000);
		await api.webhook('orders', order());
		expect((await getOrder(api, '1001')).sale?.refundedCents).toBe(4000);
	});
});

describe('currency', () => {
	test('a refund in another currency is rejected with 422, recorded, and takes nothing from the sale', async () => {
		const { api } = await paidOrder();
		const res = await api.webhook(
			'refunds',
			refund({ amount: '10.00', currency: 'usd' }),
		);

		expect(res.status).toBe(422);
		const body = await readJson<ErrorBody & { errors: RefundResult }>(res);
		expect(body.code).toBe('CURRENCY_MISMATCH');
		expect(body.errors.result).toBe('rejected');
		expect(body.errors.refund).toMatchObject({
			status: 'rejected',
			currency: 'USD',
			appliedCents: null,
			rejectionReason: expect.stringContaining('USD'),
		});
		expect(body.errors.order.sale).toMatchObject({
			refundedCents: 0,
			attributionStatus: 'active',
		});
	});

	test('a rejected refund repeated stays rejected and is reported as duplicate', async () => {
		const { api } = await paidOrder();
		const payload = refund({ currency: 'USD' });
		await api.webhook('refunds', payload);
		const res = await api.webhook('refunds', payload);
		expect(res.status).toBe(200);
		const body = await readJson<RefundResult>(res);
		expect(body.result).toBe('duplicate');
		expect(body.refund.status).toBe('rejected');
		expect(body.order.sale?.refundedCents).toBe(0);
	});

	test('an early refund in another currency is rejected when the order arrives, and the others still apply', async () => {
		const api = setup();
		await send(api, { id: 'rf_usd', amount: '50.00', currency: 'USD' });
		await send(api, { id: 'rf_brl', amount: '20.00' });

		const res = await api.webhook('orders', order());
		expect(res.status).toBe(201);
		const { sale, refunds } = (await readJson<OrderResult>(res)).order;
		expect(refunds.map((r) => [r.id, r.status, r.appliedCents])).toEqual([
			['rf_usd', 'rejected', null],
			['rf_brl', 'applied', 2000],
		]);
		expect(sale?.refundedCents).toBe(2000);
	});
});

describe('invariant: refunds never exceed the sale', () => {
	test('whatever the sequence of refunds, the applied sum never goes above the total', async () => {
		const { api } = await paidOrder('100.00');
		const amounts = ['33.33', '33.33', '33.33', '0.02', '5.00', '100.00'];
		for (const [i, amount] of amounts.entries()) {
			const { body } = await send(api, { id: `rf_${i}`, amount });
			const applied = sumApplied(body.order.refunds);
			expect(applied).toBeLessThanOrEqual(10000);
			expect(body.order.sale?.refundedCents).toBe(applied);
			expect(body.order.sale?.netCents).toBe(10000 - applied);
		}
		const { refunds, sale } = await getOrder(api, '1001');
		expect(sumApplied(refunds)).toBe(10000);
		expect(sale?.attributionStatus).toBe('reversed');
		expect(refunds.map((r) => r.appliedCents)).toEqual([
			3333, 3333, 3333, 1, 0, 0,
		]);
	});

	test('a zero-value sale stays at zero when refunded', async () => {
		const { api } = await paidOrder('0.00');
		const { body } = await send(api, { amount: '10.00' });
		expect(body.refund).toMatchObject({
			appliedCents: 0,
			excessCents: 1000,
		});
		expect(body.order.sale?.netCents).toBe(0);
	});

	test('a refund of zero is rejected as invalid input instead of failing with 500', async () => {
		const { api } = await paidOrder();
		const res = await api.webhook('refunds', refund({ amount: '0.00' }));
		expect(res.status).toBe(400);
	});
});
