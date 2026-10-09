import { createRoute } from '@hono/zod-openapi';
import { errors, json } from '../../lib/openapi';
import {
	OrderWebhookResultSchema,
	OrderWebhookSchema,
	RefundWebhookResultSchema,
	RefundWebhookSchema,
	SignatureHeadersSchema,
} from './schemas';

const tags = ['webhooks'];

export const orderWebhook = createRoute({
	method: 'post',
	path: '/webhooks/orders',
	operationId: 'receiveOrder',
	summary: 'Receive an order from the store',
	description:
		'Idempotent by order id. The first paid version creates the sale and fixes its attribution; every delivery is kept as an event.',
	tags,
	request: {
		headers: SignatureHeadersSchema,
		body: { required: true, ...json(OrderWebhookSchema, 'Store order') },
	},
	responses: {
		201: json(OrderWebhookResultSchema, 'Sale created and attributed'),
		200: json(
			OrderWebhookResultSchema,
			'Duplicate or not paid: recorded, nothing credited',
		),
		400: errors[400],
		401: errors[401],
		415: errors[415],
		500: errors[500],
	},
});

export const refundWebhook = createRoute({
	method: 'post',
	path: '/webhooks/refunds',
	operationId: 'receiveRefund',
	summary: 'Receive a refund from the store',
	description:
		'Idempotent by refund id. Applied up to what is left of the sale, so refunds never exceed it. A refund for an order that has not arrived yet stays pending and is applied when the order arrives.',
	tags,
	request: {
		headers: SignatureHeadersSchema,
		body: { required: true, ...json(RefundWebhookSchema, 'Store refund') },
	},
	responses: {
		200: json(RefundWebhookResultSchema, 'Applied, or a duplicate'),
		202: json(RefundWebhookResultSchema, 'Pending until the order arrives'),
		400: errors[400],
		401: errors[401],
		415: errors[415],
		422: errors[422],
		500: errors[500],
	},
});
