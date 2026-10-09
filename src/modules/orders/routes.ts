import { createRoute } from '@hono/zod-openapi';
import { errors, json } from '../../lib/openapi';
import { OrderDetailSchema, OrderParamsSchema } from './schemas';

export const getOrder = createRoute({
	method: 'get',
	path: '/orders/{id}',
	operationId: 'getOrder',
	summary: 'An order with its attribution, refunds and webhook history',
	description:
		'Also answers for an order that is not paid yet or only has early refunds: `sale` is null and the refunds stay pending.',
	tags: ['orders'],
	request: { params: OrderParamsSchema },
	responses: {
		200: json(OrderDetailSchema, 'Everything known about the order'),
		400: errors[400],
		404: errors[404],
		500: errors[500],
	},
});
