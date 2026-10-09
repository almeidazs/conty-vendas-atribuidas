import { and, asc, count, desc, eq, inArray, sql } from 'drizzle-orm';
import {
	creatorCoupons,
	creators,
	ledgerEntries,
	orders,
	refunds,
} from '../../db/tables';
import type { Executor } from '../../types/db';

const cents = (expression: ReturnType<typeof sql>) =>
	sql`coalesce(${expression}, 0)`.mapWith(Number);

export const createCreatorsRepository = (db: Executor) => ({
	async insert(values: typeof creators.$inferInsert, coupons: string[]) {
		const [creator] = await db.insert(creators).values(values).returning();
		if (!creator) throw new Error('Insert returned no row');
		if (coupons.length)
			await db
				.insert(creatorCoupons)
				.values(
					coupons.map((code) => ({ code, creatorId: creator.id })),
				);
		return creator;
	},

	async byUtmCode(code: string) {
		const [row] = await db
			.select({ id: creators.id })
			.from(creators)
			.where(eq(creators.utmCode, code));
		return row;
	},

	takenCoupons(codes: string[]) {
		if (!codes.length) return Promise.resolve([]);
		return db
			.select({ code: creatorCoupons.code })
			.from(creatorCoupons)
			.where(inArray(creatorCoupons.code, codes));
	},

	async find(id: string) {
		const [row] = await db
			.select()
			.from(creators)
			.where(eq(creators.id, id));
		return row;
	},

	all() {
		return db
			.select()
			.from(creators)
			.orderBy(asc(creators.name), asc(creators.id));
	},

	coupons(creatorIds: string[]) {
		if (!creatorIds.length) return Promise.resolve([]);
		return db
			.select()
			.from(creatorCoupons)
			.where(inArray(creatorCoupons.creatorId, creatorIds))
			.orderBy(asc(creatorCoupons.code));
	},

	/** Bruto, estornado e líquido por criador e moeda, a partir dos lançamentos. */
	totals(creatorIds: string[]) {
		if (!creatorIds.length) return Promise.resolve([]);
		return db
			.select({
				creatorId: orders.creatorId,
				currency: orders.currency,
				orders: sql`count(distinct ${orders.id})`.mapWith(Number),
				grossCents: cents(
					sql`sum(${ledgerEntries.amountCents}) filter (where ${ledgerEntries.kind} = 'sale')`,
				),
				refundedCents: cents(
					sql`-sum(${ledgerEntries.amountCents}) filter (where ${ledgerEntries.kind} = 'refund')`,
				),
				netCents: cents(sql`sum(${ledgerEntries.amountCents})`),
			})
			.from(ledgerEntries)
			.innerJoin(orders, eq(orders.id, ledgerEntries.orderId))
			.where(inArray(orders.creatorId, creatorIds))
			.groupBy(orders.creatorId, orders.currency)
			.orderBy(asc(orders.currency));
	},

	async sales(creatorId: string, page: number, perPage: number) {
		const refunded = cents(
			sql`(select sum(${refunds.appliedCents}) from ${refunds}
				where ${refunds.orderId} = ${orders.id} and ${refunds.status} = 'applied')`,
		);
		const [rows, [totals]] = await Promise.all([
			db
				.select({ order: orders, refundedCents: refunded })
				.from(orders)
				.where(eq(orders.creatorId, creatorId))
				.orderBy(desc(orders.paidAt), desc(orders.id))
				.limit(perPage)
				.offset((page - 1) * perPage),
			db
				.select({ total: count() })
				.from(orders)
				.where(and(eq(orders.creatorId, creatorId))),
		]);
		return { rows, total: totals?.total ?? 0 };
	},
});

export type CreatorsRepository = ReturnType<typeof createCreatorsRepository>;
