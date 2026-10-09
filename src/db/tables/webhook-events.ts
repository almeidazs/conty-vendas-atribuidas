import {
	bigint,
	index,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uuid,
} from 'drizzle-orm/pg-core';

export const webhookTopic = pgEnum('webhook_topic', ['orders', 'refunds']);

/** Cada entrega de webhook, como chegou e o que foi feito com ela. */
export const webhookEvents = pgTable(
	'webhook_events',
	{
		id: uuid().primaryKey().defaultRandom(),
		// Ordem de chegada: o id é aleatório e received_at empata no mesmo milissegundo.
		seq: bigint({ mode: 'number' }).generatedAlwaysAsIdentity(),
		topic: webhookTopic().notNull(),
		externalId: text().notNull(),
		orderId: text().notNull(),
		payloadHash: text().notNull(),
		// O corpo bruto, como chegou (texto, não jsonb: guarda exatamente os bytes assinados).
		payload: text().notNull(),
		outcome: text().notNull(),
		receivedAt: timestamp({ withTimezone: true }).notNull(),
	},
	(t) => [index('webhook_events_order').on(t.orderId, t.seq)],
);
