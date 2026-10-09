import { and, asc, eq, inArray, sql, sum } from 'drizzle-orm';
import {
	creatorCoupons,
	creators,
	ledgerEntries,
	orders,
	refunds,
	webhookEvents,
} from '../../db/tables';
import type { Executor } from '../../types/db';

export const createOrdersRepository = (db: Executor) => ({
	/**
	 * Serializa tudo que mexe num pedido (o pedido e os estornos dele), mesmo
	 * antes de a linha existir: um estorno e o pedido chegando juntos não se
	 * perdem um do outro.
	 */
	async lock(orderId: string) {
		await db.execute(
			sql`select pg_advisory_xact_lock(hashtextextended(${orderId}, 0))`,
		);
	},

	async order(id: string) {
		const [row] = await db.select().from(orders).where(eq(orders.id, id));
		return row;
	},

	async insertOrder(values: typeof orders.$inferInsert) {
		await db.insert(orders).values(values);
	},

	async insertEntry(values: typeof ledgerEntries.$inferInsert) {
		await db.insert(ledgerEntries).values(values);
	},

	refunds(orderId: string) {
		return db
			.select()
			.from(refunds)
			.where(eq(refunds.orderId, orderId))
			.orderBy(asc(refunds.seq));
	},

	async refund(id: string) {
		const [row] = await db.select().from(refunds).where(eq(refunds.id, id));
		return row;
	},

	async insertRefund(values: typeof refunds.$inferInsert) {
		await db.insert(refunds).values(values);
	},

	async updateRefund(
		id: string,
		values: Partial<typeof refunds.$inferInsert>,
	) {
		await db.update(refunds).set(values).where(eq(refunds.id, id));
	},

	async appliedCents(orderId: string) {
		const [row] = await db
			.select({ total: sum(refunds.appliedCents).mapWith(Number) })
			.from(refunds)
			.where(
				and(
					eq(refunds.orderId, orderId),
					eq(refunds.status, 'applied'),
				),
			);
		return row?.total ?? 0;
	},

	async insertEvent(values: typeof webhookEvents.$inferInsert) {
		await db.insert(webhookEvents).values(values);
	},

	events(orderId: string) {
		return db
			.select()
			.from(webhookEvents)
			.where(eq(webhookEvents.orderId, orderId))
			.orderBy(asc(webhookEvents.seq));
	},

	async creatorNames(ids: string[]) {
		if (!ids.length) return new Map<string, string>();
		const rows = await db
			.select({ id: creators.id, name: creators.name })
			.from(creators)
			.where(inArray(creators.id, ids));
		return new Map(rows.map((row) => [row.id, row.name]));
	},

	async couponOwners(codes: string[]) {
		if (!codes.length) return new Map<string, string>();
		const rows = await db
			.select()
			.from(creatorCoupons)
			.where(inArray(creatorCoupons.code, codes));
		return new Map(rows.map((row) => [row.code, row.creatorId]));
	},

	async utmOwners(code: string | null) {
		if (!code) return new Map<string, string>();
		const rows = await db
			.select({ id: creators.id, code: creators.utmCode })
			.from(creators)
			.where(eq(creators.utmCode, code));
		return new Map(rows.map((row) => [row.code, row.id]));
	},
});

export type OrdersRepository = ReturnType<typeof createOrdersRepository>;
