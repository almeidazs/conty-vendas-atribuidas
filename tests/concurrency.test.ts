import { describe, expect, test } from 'vitest';
import {
	createCreator,
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

const N = 10;

const times = <T>(n: number, fn: (i: number) => Promise<T>) =>
	Promise.all(Array.from({ length: n }, (_, i) => fn(i)));

describe('concurrent deliveries', () => {
	test('the same order delivered N times at once creates exactly one sale', async () => {
		const api = setup();
		const ana = await createCreator(api, {
			name: 'Ana',
			utm_code: 'ana',
			coupons: ['ANA10'],
		});
		const payload = order({ discount_codes: [{ code: 'ANA10' }] });

		const responses = await times(N, () => api.webhook('orders', payload));
		const results = await Promise.all(
			responses.map(async (res) => ({
				status: res.status,
				result: (await readJson<OrderResult>(res)).result,
			})),
		);

		expect(results.filter((r) => r.status === 201)).toEqual([
			{ status: 201, result: 'credited' },
		]);
		expect(
			results.filter((r) => r.status === 200 && r.result === 'duplicate'),
		).toHaveLength(N - 1);

		const detail = await getOrder(api, '1001');
		expect(detail.events).toHaveLength(N);
		expect(detail.sale?.totalCents).toBe(10000);
		const summary = (await listCreators(api)).find((c) => c.id === ana.id);
		expect(summary?.totals[0]).toMatchObject({
			orders: 1,
			grossCents: 10000,
		});
	});

	test('different refunds racing on the same order never take more than the sale', async () => {
		const api = setup();
		await api.webhook('orders', order({ total_price: '100.00' }));

		const responses = await times(N, (i) =>
			api.webhook('refunds', refund({ id: `rf_${i}`, amount: '15.00' })),
		);
		expect(responses.every((res) => res.status === 200)).toBe(true);

		const { sale, refunds } = await getOrder(api, '1001');
		expect(refunds).toHaveLength(N);
		expect(sumApplied(refunds)).toBe(10000);
		expect(
			refunds.reduce((total, r) => total + (r.excessCents ?? 0), 0),
		).toBe(N * 1500 - 10000);
		expect(sale).toMatchObject({
			refundedCents: 10000,
			netCents: 0,
			attributionStatus: 'reversed',
		});
	});

	test('the same refund delivered N times at once is applied once', async () => {
		const api = setup();
		await api.webhook('orders', order());
		const payload = refund({ amount: '25.00' });

		const responses = await times(N, () => api.webhook('refunds', payload));
		const results = await Promise.all(
			responses.map(
				async (res) => (await readJson<RefundResult>(res)).result,
			),
		);

		expect(results.filter((r) => r === 'applied')).toHaveLength(1);
		expect(results.filter((r) => r === 'duplicate')).toHaveLength(N - 1);
		const { sale, refunds } = await getOrder(api, '1001');
		expect(refunds).toHaveLength(1);
		expect(sale?.refundedCents).toBe(2500);
	});

	test('a refund racing its order is applied exactly once, whichever arrives first', async () => {
		for (let round = 0; round < 5; round++) {
			const api = setup();
			const id = `race-${round}`;
			const [orderRes, refundRes] = await Promise.all([
				api.webhook('orders', order({ id })),
				api.webhook(
					'refunds',
					refund({
						id: `rf_${round}`,
						order_id: id,
						amount: '40.00',
					}),
				),
			]);
			expect(orderRes.status).toBe(201);
			expect([200, 202]).toContain(refundRes.status);

			const { sale, refunds } = await getOrder(api, id);
			expect(refunds).toEqual([
				expect.objectContaining({
					status: 'applied',
					appliedCents: 4000,
				}),
			]);
			expect(sale?.refundedCents).toBe(4000);
		}
	});

	test('orders, duplicates and refunds for several orders interleaved keep every order consistent', async () => {
		const api = setup();
		const ids = ['A', 'B', 'C'];
		const deliveries = ids.flatMap((id) => [
			() => api.webhook('orders', order({ id, total_price: '50.00' })),
			() => api.webhook('orders', order({ id, total_price: '50.00' })),
			() =>
				api.webhook(
					'refunds',
					refund({ id: `${id}-1`, order_id: id, amount: '30.00' }),
				),
			() =>
				api.webhook(
					'refunds',
					refund({ id: `${id}-2`, order_id: id, amount: '30.00' }),
				),
			() =>
				api.webhook(
					'refunds',
					refund({ id: `${id}-2`, order_id: id, amount: '30.00' }),
				),
		]);
		await Promise.all(deliveries.map((deliver) => deliver()));

		for (const id of ids) {
			const { sale, refunds } = await getOrder(api, id);
			expect(sale?.totalCents).toBe(5000);
			expect(refunds).toHaveLength(2);
			expect(refunds.every((r) => r.status === 'applied')).toBe(true);
			expect(sumApplied(refunds)).toBe(5000);
			expect(sale?.netCents).toBe(0);
		}
	});
});
