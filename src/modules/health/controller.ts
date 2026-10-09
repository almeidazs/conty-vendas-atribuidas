import { sql } from 'drizzle-orm';
import { createRouter } from '../../lib/openapi';
import * as routes from './routes';

export const healthController = createRouter().openapi(
	routes.health,
	async (c) => {
		await c.var.db.execute(sql`select 1`);
		return c.json({ status: 'ok', database: 'ok' } as const, 200);
	},
);
