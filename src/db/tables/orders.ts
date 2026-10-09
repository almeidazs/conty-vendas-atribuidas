import { relations, sql } from 'drizzle-orm';
import {
	bigint,
	check,
	index,
	jsonb,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uuid,
	varchar,
} from 'drizzle-orm/pg-core';
import type { Utm } from '../../types/sales';
import { creators } from './creators';
import { ledgerEntries } from './ledger';

export const attributionReason = pgEnum('attribution_reason', [
	'coupon',
	'utm',
	'none',
]);

/**
 * A venda, criada pela primeira versão paga do pedido. Ela e a atribuição não
 * mudam depois: webhooks seguintes viram eventos e estornos viram lançamentos.
 */
export const orders = pgTable(
	'orders',
	{
		id: text().primaryKey(),
		financialStatus: text().notNull(),
		totalCents: bigint({ mode: 'number' }).notNull(),
		currency: varchar({ length: 3 }).notNull(),
		couponCodes: jsonb().$type<string[]>().notNull(),
		utm: jsonb().$type<Utm | null>(),
		creatorId: uuid().references(() => creators.id),
		attributionReason: attributionReason().notNull(),
		attributedCoupon: text(),
		// Criador que a UTM apontava, quando perdeu o desempate para o cupom.
		conflictCreatorId: uuid().references(() => creators.id),
		payloadHash: text().notNull(),
		paidAt: timestamp({ withTimezone: true }).notNull(),
	},
	(t) => [
		check('orders_total_not_negative', sql`${t.totalCents} >= 0`),
		index('orders_creator_paid_at').on(t.creatorId, t.paidAt),
	],
);

export const ordersRelations = relations(orders, ({ one, many }) => ({
	creator: one(creators, {
		fields: [orders.creatorId],
		references: [creators.id],
	}),
	entries: many(ledgerEntries),
}));
