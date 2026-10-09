import { conflict, ErrorCode, notFound } from '../../errors';
import { createRouter } from '../../lib/openapi';
import * as routes from './routes';
import { createCreatorsService } from './service';

export const creatorsController = createRouter()
	.openapi(routes.createCreator, async (c) => {
		const result = await createCreatorsService(
			c.var.db,
			c.var.clock,
		).create(c.req.valid('json'));
		if (!result.ok) return conflict(c, result.code, result.errors);
		return c.json(result.value, 201);
	})
	.openapi(routes.listCreators, async (c) =>
		c.json(await createCreatorsService(c.var.db, c.var.clock).list(), 200),
	)
	.openapi(routes.creatorSales, async (c) => {
		const { page, perPage } = c.req.valid('query');
		const sales = await createCreatorsService(c.var.db, c.var.clock).sales(
			c.req.valid('param').id,
			page,
			perPage,
		);
		if (!sales) return notFound(c, ErrorCode.CREATOR_NOT_FOUND);
		return c.json(sales, 200);
	});
