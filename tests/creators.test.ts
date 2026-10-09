import { describe, expect, test } from 'vitest';
import type { CreatorSales, CreatorSummary } from '../src/types/sales';
import {
	contyUtm,
	createCreator,
	type ErrorBody,
	listCreators,
	order,
	readJson,
	refund,
	setup,
} from './helpers';

describe('POST /creators', () => {
	test('creates a creator with its coupons and UTM code', async () => {
		const api = setup();
		const res = await api.request('POST', '/creators', {
			body: { name: 'Ana Souza', utm_code: 'ana', coupons: ['ANA10'] },
		});
		expect(res.status).toBe(201);
		expect(await readJson<CreatorSummary>(res)).toEqual({
			id: expect.any(String),
			name: 'Ana Souza',
			utmCode: 'ana',
			coupons: ['ANA10'],
			createdAt: '2026-10-10T12:00:00.000Z',
			totals: [],
		});
	});

	test('normalizes the UTM code to lower case and coupons to upper case without duplicates', async () => {
		const api = setup();
		const creator = await createCreator(api, {
			name: '  Ana  ',
			utm_code: '  Ana.Souza ',
			coupons: ['ana10', ' ANA10 ', 'Ana20'],
		});
		expect(creator).toMatchObject({
			name: 'Ana',
			utmCode: 'ana.souza',
			coupons: ['ANA10', 'ANA20'],
		});
	});

	test('coupons are optional', async () => {
		const api = setup();
		expect(
			(await createCreator(api, { name: 'Ana', utm_code: 'ana' }))
				.coupons,
		).toEqual([]);
	});

	test('a UTM code already taken, in any case, is a 409', async () => {
		const api = setup();
		await createCreator(api, { name: 'Ana', utm_code: 'ana' });
		const res = await api.request('POST', '/creators', {
			body: { name: 'Other', utm_code: 'ANA' },
		});
		expect(res.status).toBe(409);
		expect((await readJson<ErrorBody>(res)).code).toBe('UTM_CODE_TAKEN');
	});

	test('a coupon already taken, in any case, is a 409 that names the coupon', async () => {
		const api = setup();
		await createCreator(api, {
			name: 'Ana',
			utm_code: 'ana',
			coupons: ['ANA10'],
		});
		const res = await api.request('POST', '/creators', {
			body: {
				name: 'Bruno',
				utm_code: 'bruno',
				coupons: ['B15', 'ana10'],
			},
		});
		expect(res.status).toBe(409);
		expect(await readJson<ErrorBody>(res)).toMatchObject({
			code: 'COUPON_TAKEN',
			errors: { coupons: ['ANA10'] },
		});
		expect((await listCreators(api)).map((c) => c.name)).toEqual(['Ana']);
	});

	test('two creators registered at once with the same UTM code: one wins, the other gets 409', async () => {
		const api = setup();
		const responses = await Promise.all(
			[1, 2, 3].map((i) =>
				api.request('POST', '/creators', {
					body: {
						name: `C${i}`,
						utm_code: 'same',
						coupons: [`C${i}`],
					},
				}),
			),
		);
		expect(responses.map((r) => r.status).sort()).toEqual([201, 409, 409]);
		expect(await listCreators(api)).toHaveLength(1);
	});

	test.each([
		['an invalid UTM code', { name: 'A', utm_code: 'has space' }],
		['a UTM code starting with a symbol', { name: 'A', utm_code: '-ana' }],
		[
			'a UTM code over 50 characters',
			{ name: 'A', utm_code: 'a'.repeat(51) },
		],
		['a blank name', { name: '   ', utm_code: 'ana' }],
		['a blank coupon', { name: 'A', utm_code: 'ana', coupons: ['  '] }],
		['an unknown field', { name: 'A', utm_code: 'ana', admin: true }],
		['a missing UTM code', { name: 'A' }],
	])('rejects %s with 400', async (_, body) => {
		const api = setup();
		const res = await api.request('POST', '/creators', { body });
		expect(res.status).toBe(400);
		expect((await readJson<ErrorBody>(res)).code).toBe('VALIDATION_FAILED');
	});
});

describe('GET /creators', () => {
	test('lists creators with totals per currency', async () => {
		const api = setup();
		const ana = await createCreator(api, {
			name: 'Ana',
			utm_code: 'ana',
			coupons: ['ANA10'],
		});
		await createCreator(api, { name: 'Bruno', utm_code: 'bruno' });

		await api.webhook(
			'orders',
			order({
				id: '1',
				total_price: '100.00',
				discount_codes: [{ code: 'ANA10' }],
			}),
		);
		await api.webhook(
			'orders',
			order({ id: '2', total_price: '50.00', utm: contyUtm('ana') }),
		);
		await api.webhook(
			'orders',
			order({
				id: '3',
				total_price: '20.00',
				currency: 'USD',
				utm: contyUtm('ana'),
			}),
		);
		await api.webhook(
			'refunds',
			refund({ id: 'r1', order_id: '1', amount: '25.00' }),
		);
		await api.webhook(
			'refunds',
			refund({
				id: 'r2',
				order_id: '3',
				amount: '20.00',
				currency: 'USD',
			}),
		);

		const creators = await listCreators(api);
		expect(creators.map((c) => c.name)).toEqual(['Ana', 'Bruno']);
		expect(creators.find((c) => c.id === ana.id)?.totals).toEqual([
			{
				currency: 'BRL',
				orders: 2,
				grossCents: 15000,
				refundedCents: 2500,
				netCents: 12500,
			},
			{
				currency: 'USD',
				orders: 1,
				grossCents: 2000,
				refundedCents: 2000,
				netCents: 0,
			},
		]);
		expect(creators.find((c) => c.name === 'Bruno')?.totals).toEqual([]);
	});
});

describe('GET /creators/:id/sales', () => {
	test('pages through the sales of one creator, most recent first', async () => {
		const api = setup();
		const ana = await createCreator(api, {
			name: 'Ana',
			utm_code: 'ana',
			coupons: ['ANA10'],
		});
		await createCreator(api, {
			name: 'Bruno',
			utm_code: 'bruno',
			coupons: ['BRUNO15'],
		});
		for (const id of ['1', '2', '3', '4', '5']) {
			await api.webhook(
				'orders',
				order({ id, discount_codes: [{ code: 'ANA10' }] }),
			);
			api.clock.advance(1000);
		}
		await api.webhook(
			'orders',
			order({ id: 'b', discount_codes: [{ code: 'BRUNO15' }] }),
		);
		await api.webhook(
			'refunds',
			refund({ order_id: '4', amount: '40.00' }),
		);

		const page = async (query: string) =>
			readJson<CreatorSales>(
				await api.request('GET', `/creators/${ana.id}/sales?${query}`),
			);

		const first = await page('page=1&perPage=2');
		expect(first.creator.id).toBe(ana.id);
		expect(first.pagination).toEqual({
			page: 1,
			perPage: 2,
			total: 5,
			pageCount: 3,
		});
		expect(first.data.map((s) => s.orderId)).toEqual(['5', '4']);
		expect(first.data[1]).toEqual({
			orderId: '4',
			currency: 'BRL',
			totalCents: 10000,
			refundedCents: 4000,
			netCents: 6000,
			attributionStatus: 'partially_refunded',
			reason: 'coupon',
			paidAt: '2026-10-10T12:00:03.000Z',
		});

		const last = await page('page=3&perPage=2');
		expect(last.data.map((s) => s.orderId)).toEqual(['1']);
		expect((await page('page=4&perPage=2')).data).toEqual([]);
	});

	test('rejects invalid pagination with 400', async () => {
		const api = setup();
		const ana = await createCreator(api, { name: 'Ana', utm_code: 'ana' });
		for (const query of ['page=0', 'perPage=0', 'perPage=101', 'page=x'])
			expect(
				(await api.request('GET', `/creators/${ana.id}/sales?${query}`))
					.status,
			).toBe(400);
	});

	test('an unknown creator is 404', async () => {
		const api = setup();
		const res = await api.request(
			'GET',
			'/creators/00000000-0000-4000-8000-000000000000/sales',
		);
		expect(res.status).toBe(404);
		expect((await readJson<ErrorBody>(res)).code).toBe('CREATOR_NOT_FOUND');
	});

	test('a creator id that is not a UUID is 400', async () => {
		const api = setup();
		expect((await api.request('GET', '/creators/abc/sales')).status).toBe(
			400,
		);
	});
});
