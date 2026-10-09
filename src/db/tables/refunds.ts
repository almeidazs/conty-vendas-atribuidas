import { sql } from 'drizzle-orm';
import {
	bigint,
	check,
	index,
	pgEnum,
	pgTable,
	text,
	timestamp,
	varchar,
} from 'drizzle-orm/pg-core';

export const refundStatus = pgEnum('refund_status', [
	'pending',
	'applied',
	'rejected',
]);

/**
 * Todo estorno recebido fica aqui, inclusive o que chegou antes do pedido
 * (`pending`) e o que não pôde ser aplicado (`rejected`). Sem FK para orders
 * de propósito: o pedido pode ainda não existir.
 */
export const refunds = pgTable(
	'refunds',
	{
		id: text().primaryKey(),
		// Ordem de chegada. received_at sozinho empata no mesmo milissegundo.
		seq: bigint({ mode: 'number' }).generatedAlwaysAsIdentity(),
		orderId: text().notNull(),
		requestedCents: bigint({ mode: 'number' }).notNull(),
		// Quanto de fato saiu da venda: o pedido, limitado ao que restava.
		appliedCents: bigint({ mode: 'number' }),
		currency: varchar({ length: 3 }).notNull(),
		status: refundStatus().notNull(),
		rejectionReason: text(),
		refundedAt: timestamp({ withTimezone: true }),
		receivedAt: timestamp({ withTimezone: true }).notNull(),
		appliedAt: timestamp({ withTimezone: true }),
		payloadHash: text().notNull(),
	},
	(t) => [
		check('refunds_requested_positive', sql`${t.requestedCents} > 0`),
		check(
			'refunds_applied_within_requested',
			sql`${t.appliedCents} is null or (${t.appliedCents} >= 0 and ${t.appliedCents} <= ${t.requestedCents})`,
		),
		check(
			'refunds_applied_consistent',
			sql`(${t.status} = 'applied') = (${t.appliedCents} is not null and ${t.appliedAt} is not null)`,
		),
		index('refunds_order_seq').on(t.orderId, t.seq),
	],
);
