import { Scalar } from '@scalar/hono-api-reference';
import { HTTPException } from 'hono/http-exception';
import { requestId } from 'hono/request-id';
import { createDb } from './db/client';
import {
	badRequest,
	ErrorCode,
	internalError,
	notFound,
	unsupportedMediaType,
} from './errors';
import { systemClock } from './lib/clock';
import { createRouter } from './lib/openapi';
import { creatorsController } from './modules/creators/controller';
import { healthController } from './modules/health/controller';
import { ordersController } from './modules/orders/controller';
import { webhooksController } from './modules/webhooks/controller';
import type { Clock } from './types/clock';

/** O relógio é injetado para os testes controlarem "agora" sem mexer no Date global. */
export const createApp = ({ clock = systemClock }: { clock?: Clock } = {}) => {
	const app = createRouter();

	app.use(requestId());
	app.notFound((c) => notFound(c, ErrorCode.ROUTE_NOT_FOUND));
	app.onError((error, c) => {
		// Erros do próprio Hono/validador: JSON malformado (400) e body que não é JSON (415).
		if (error instanceof HTTPException) {
			if (error.status === 400) return badRequest(c);
			if (error.status === 415) return unsupportedMediaType(c);
		}
		console.error(error);
		return internalError(c);
	});

	// postgres-js só conecta na primeira query, então rotas sem banco não pagam nada.
	app.use(async (c, next) => {
		const { db, sql } = createDb(c.env.HYPERDRIVE.connectionString);
		c.set('db', db);
		c.set('clock', clock);
		try {
			await next();
		} finally {
			await sql.end();
		}
	});

	app.route('/', healthController);
	app.route('/', webhooksController);
	app.route('/', ordersController);
	app.route('/', creatorsController);

	app.doc31('/openapi.json', {
		openapi: '3.1.0',
		info: {
			title: 'Conty - Creator sales attribution',
			version: '1.0.0',
			description:
				'Store webhooks (orders and refunds) attributed to at most one creator by coupon or Conty UTM. Duplicated webhooks never add the sale again, refunds never exceed it, and refunds that arrive before the order wait for it. Nothing is deleted.',
		},
		servers: [
			{
				url: 'http://localhost:8787',
				description: 'Local (wrangler dev)',
			},
		],
		tags: [
			{ name: 'webhooks', description: 'Signed store webhooks' },
			{ name: 'orders', description: 'Order history' },
			{ name: 'creators', description: 'Creators and their sales' },
			{ name: 'health', description: 'Liveness and database readiness' },
		],
	});
	app.get(
		'/docs',
		Scalar({
			url: '/openapi.json',
			pageTitle: 'Conty - Sales attribution',
		}),
	);

	return app;
};
