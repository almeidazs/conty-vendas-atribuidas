import { z } from '@hono/zod-openapi';
import { amount, currency, externalId, safeString } from '../../lib/validation';
import { OrderDetailSchema, RefundSchema } from '../orders/schemas';

const utmField = safeString(200).nullish();

// `.loose()`: o payload real da loja tem dezenas de campos que não usamos.
export const OrderWebhookSchema = z
	.object({
		id: externalId,
		total_price: amount,
		currency,
		financial_status: safeString(50)
			.trim()
			.min(1)
			.transform((value) => value.toLowerCase())
			.openapi({ example: 'paid' }),
		discount_codes: z
			.array(z.object({ code: safeString(100) }).loose())
			.max(50)
			.default([])
			.openapi({ example: [{ code: 'ANA10' }] }),
		utm: z
			.object({
				source: utmField,
				medium: utmField,
				campaign: utmField,
				content: utmField,
				term: utmField,
			})
			.loose()
			.nullish()
			.openapi({ example: { source: 'conty', content: 'bruno' } }),
	})
	.loose()
	.openapi('OrderWebhook');

export const RefundWebhookSchema = z
	.object({
		id: externalId.openapi({ example: 'rf_1' }),
		order_id: externalId,
		amount: amount.refine(
			(cents) => cents > 0,
			'Refund amount must be greater than zero',
		),
		currency,
		created_at: z.iso
			.datetime({ offset: true })
			.optional()
			.openapi({ example: '2026-10-12T15:00:00Z' }),
	})
	.loose()
	.openapi('RefundWebhook');

export const OrderWebhookResultSchema = z
	.object({
		result: z
			.enum(['credited', 'duplicate', 'duplicate_changed', 'not_paid'])
			.openapi({
				description:
					'credited: the sale was created now. duplicate: same payload again, nothing changed. duplicate_changed: same order id with another payload, recorded as an event only. not_paid: the order is not paid yet, recorded as an event only.',
			}),
		order: OrderDetailSchema,
	})
	.openapi('OrderWebhookResult');

export const RefundWebhookResultSchema = z
	.object({
		result: z
			.enum([
				'applied',
				'pending',
				'rejected',
				'duplicate',
				'duplicate_changed',
			])
			.openapi({
				description:
					'applied: taken from the sale (capped at what was left). pending: the order has not arrived yet; applied when it does. rejected: currency mismatch. duplicate / duplicate_changed: this refund id was already received.',
			}),
		refund: RefundSchema,
		order: OrderDetailSchema,
	})
	.openapi('RefundWebhookResult');

export const SignatureHeadersSchema = z.object({
	'x-webhook-signature': z.string().openapi({
		param: { name: 'x-webhook-signature', in: 'header' },
		description:
			'Base64 HMAC-SHA256 of the raw body with the webhook secret.',
		example: 'q9q3Zp0dJbQh6m7wQe2Q8k1mVvKkqgk0f8Zx0j3m1nA=',
	}),
});
