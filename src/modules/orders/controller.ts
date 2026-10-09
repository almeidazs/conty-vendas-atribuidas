import { ErrorCode, notFound } from '../../errors';
import { createRouter } from '../../lib/openapi';
import { loadOrderDetail } from './presenter';
import { createOrdersRepository } from './repository';
import * as routes from './routes';

export const ordersController = createRouter().openapi(
	routes.getOrder,
	async (c) => {
		const id = c.req.valid('param').id;
		const order = await c.var.db.transaction(
			(tx) => loadOrderDetail(createOrdersRepository(tx), id),
			{ isolationLevel: 'repeatable read', accessMode: 'read only' },
		);
		return order
			? c.json(order, 200)
			: notFound(c, ErrorCode.ORDER_NOT_FOUND);
	},
);
