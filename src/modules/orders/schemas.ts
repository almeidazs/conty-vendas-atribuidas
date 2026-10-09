import { z } from '@hono/zod-openapi';
import { safeString } from '../../lib/validation';

const instant = z.iso.datetime({ offset: true });

export const CreatorRefSchema = z
	.object({ id: z.uuid(), name: z.string() })
	.openapi('CreatorRef');

export const SaleSchema = z
	.object({
		financialStatus: z.string().openapi({ example: 'paid' }),
		currency: z.string().openapi({ example: 'BRL' }),
		totalCents: z.number().int().openapi({ example: 14990 }),
		refundedCents: z.number().int().openapi({ example: 4990 }),
		netCents: z.number().int().openapi({ example: 10000 }),
		attributionStatus: z
			.enum(['active', 'partially_refunded', 'reversed'])
			.openapi({
				description:
					'reversed: refunds took the whole sale. The history is kept.',
			}),
		creator: CreatorRefSchema.nullable(),
		attribution: z.object({
			reason: z.enum(['coupon', 'utm', 'none']),
			coupon: z.string().nullable().openapi({ example: 'ANA10' }),
			utmContent: z.string().nullable().openapi({ example: 'bruno' }),
			conflict: CreatorRefSchema.nullable().openapi({
				description:
					'The UTM creator that lost the tie-break to the coupon.',
			}),
		}),
		couponCodes: z.array(z.string()),
		paidAt: instant,
	})
	.openapi('Sale');

export const RefundSchema = z
	.object({
		id: z.string().openapi({ example: 'rf_1' }),
		orderId: z.string(),
		status: z.enum(['pending', 'applied', 'rejected']),
		requestedCents: z.number().int().openapi({ example: 4990 }),
		appliedCents: z.number().int().nullable().openapi({
			description:
				'What actually left the sale: the request capped at what was left.',
			example: 4990,
		}),
		excessCents: z.number().int().nullable().openapi({
			description:
				'Requested but not applied, because the sale had nothing left.',
			example: 0,
		}),
		currency: z.string(),
		rejectionReason: z.string().nullable(),
		refundedAt: instant.nullable(),
		receivedAt: instant,
		appliedAt: instant.nullable(),
	})
	.openapi('Refund');

export const EventSchema = z
	.object({
		id: z.uuid(),
		topic: z.enum(['orders', 'refunds']),
		externalId: z.string(),
		outcome: z.string().openapi({ example: 'credited' }),
		payloadHash: z.string(),
		receivedAt: instant,
	})
	.openapi('WebhookEvent');

export const OrderDetailSchema = z
	.object({
		id: z.string().openapi({ example: '5551234' }),
		sale: SaleSchema.nullable().openapi({
			description: 'Null until a paid version of the order arrives.',
		}),
		refunds: z.array(RefundSchema),
		events: z.array(EventSchema).openapi({
			description: 'Every webhook delivery for this order, oldest first.',
		}),
	})
	.openapi('OrderDetail');

export const OrderParamsSchema = z.object({
	id: safeString(100)
		.min(1)
		.openapi({ param: { name: 'id', in: 'path' }, example: '5551234' }),
});
