import type { z } from '@hono/zod-openapi';
import type { creators, orders, refunds, webhookEvents } from '../db/tables';
import type {
	CreateCreatorSchema,
	CreatorSalesSchema,
	CreatorSchema,
	CreatorSummarySchema,
} from '../modules/creators/schemas';
import type {
	EventSchema,
	OrderDetailSchema,
	RefundSchema,
	SaleSchema,
} from '../modules/orders/schemas';
import type {
	OrderWebhookSchema,
	RefundWebhookSchema,
} from '../modules/webhooks/schemas';

export type Utm = {
	source?: string | null;
	medium?: string | null;
	campaign?: string | null;
	content?: string | null;
	term?: string | null;
};

export type CreatorRow = typeof creators.$inferSelect;
export type OrderRow = typeof orders.$inferSelect;
export type RefundRow = typeof refunds.$inferSelect;
export type WebhookEventRow = typeof webhookEvents.$inferSelect;

export type CreateCreatorInput = z.infer<typeof CreateCreatorSchema>;
export type Creator = z.infer<typeof CreatorSchema>;
export type CreatorSummary = z.infer<typeof CreatorSummarySchema>;
export type CreatorSales = z.infer<typeof CreatorSalesSchema>;

export type OrderWebhook = z.infer<typeof OrderWebhookSchema>;
export type RefundWebhook = z.infer<typeof RefundWebhookSchema>;

export type Sale = z.infer<typeof SaleSchema>;
export type Refund = z.infer<typeof RefundSchema>;
export type WebhookEvent = z.infer<typeof EventSchema>;
export type OrderDetail = z.infer<typeof OrderDetailSchema>;

export type OrderOutcome =
	| 'credited'
	| 'duplicate'
	| 'duplicate_changed'
	| 'not_paid';
export type RefundOutcome =
	| 'applied'
	| 'pending'
	| 'rejected'
	| 'duplicate'
	| 'duplicate_changed';
