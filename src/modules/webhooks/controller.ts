import { ErrorCode, unauthorized, unprocessable } from '../../errors';
import { createRouter } from '../../lib/openapi';
import { verifySignature } from '../../lib/signature';
import * as routes from './routes';
import { createWebhooksService } from './service';

export const webhooksController = createRouter();

// A assinatura vale para o corpo bruto, antes de qualquer parse.
webhooksController.use('/webhooks/*', async (c, next) => {
	const valid = await verifySignature(
		c.env.WEBHOOK_SECRET,
		await c.req.text(),
		c.req.header('x-webhook-signature'),
	);
	if (!valid) return unauthorized(c, ErrorCode.INVALID_SIGNATURE);
	await next();
});

webhooksController
	.openapi(routes.orderWebhook, async (c) => {
		const outcome = await createWebhooksService(
			c.var.db,
			c.var.clock,
		).ingestOrder(await c.req.text(), c.req.valid('json'));
		return c.json(outcome, outcome.result === 'credited' ? 201 : 200);
	})
	.openapi(routes.refundWebhook, async (c) => {
		const outcome = await createWebhooksService(
			c.var.db,
			c.var.clock,
		).ingestRefund(await c.req.text(), c.req.valid('json'));
		if (outcome.result === 'rejected')
			return unprocessable(c, ErrorCode.CURRENCY_MISMATCH, outcome);
		return c.json(outcome, outcome.result === 'pending' ? 202 : 200);
	});
