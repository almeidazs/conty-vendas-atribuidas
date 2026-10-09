import { relations } from 'drizzle-orm';
import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { orders } from './orders';

export const creators = pgTable('creators', {
	id: uuid().primaryKey().defaultRandom(),
	name: text().notNull(),
	// Normalizado (minúsculo): é o valor de utm_content nos links do criador.
	utmCode: text().notNull().unique(),
	createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const creatorCoupons = pgTable('creator_coupons', {
	// Normalizado (maiúsculo, sem espaços nas pontas): um cupom é de um criador só.
	code: text().primaryKey(),
	creatorId: uuid()
		.notNull()
		.references(() => creators.id, { onDelete: 'cascade' }),
});

export const creatorsRelations = relations(creators, ({ many }) => ({
	coupons: many(creatorCoupons),
	orders: many(orders),
}));

export const creatorCouponsRelations = relations(creatorCoupons, ({ one }) => ({
	creator: one(creators, {
		fields: [creatorCoupons.creatorId],
		references: [creators.id],
	}),
}));
