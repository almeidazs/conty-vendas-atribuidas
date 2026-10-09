import { relations, sql } from 'drizzle-orm';
import {
	bigint,
	check,
	index,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from 'drizzle-orm/pg-core';
import { creators } from './creators';
import { orders } from './orders';
import { refunds } from './refunds';

export const ledgerKind = pgEnum('ledger_kind', ['sale', 'refund']);

/**
 * Append-only: a venda entra positiva e cada estorno entra negativo. O líquido
 * do criador é a soma, e nada é apagado nem editado.
 */
export const ledgerEntries = pgTable(
	'ledger_entries',
	{
		id: uuid().primaryKey().defaultRandom(),
		orderId: text()
			.notNull()
			.references(() => orders.id),
		creatorId: uuid().references(() => creators.id),
		kind: ledgerKind().notNull(),
		amountCents: bigint({ mode: 'number' }).notNull(),
		refundId: text()
			.unique()
			.references(() => refunds.id),
		createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
	},
	(t) => [
		uniqueIndex('ledger_one_sale_per_order')
			.on(t.orderId)
			.where(sql`${t.kind} = 'sale'`),
		check(
			'ledger_entry_shape',
			sql`(${t.kind} = 'sale' and ${t.amountCents} >= 0 and ${t.refundId} is null)
				or (${t.kind} = 'refund' and ${t.amountCents} <= 0 and ${t.refundId} is not null)`,
		),
		index('ledger_creator').on(t.creatorId),
	],
);

export const ledgerEntriesRelations = relations(ledgerEntries, ({ one }) => ({
	order: one(orders, {
		fields: [ledgerEntries.orderId],
		references: [orders.id],
	}),
}));
