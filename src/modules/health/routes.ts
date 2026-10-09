import { createRoute, z } from '@hono/zod-openapi';
import { errors, json } from '../../lib/openapi';

export const HealthSchema = z
	.object({
		status: z.literal('ok'),
		database: z.literal('ok'),
	})
	.openapi('Health');

export const health = createRoute({
	method: 'get',
	path: '/health',
	operationId: 'health',
	summary: 'Health check',
	description: 'Checks that the API is up and the database answers.',
	tags: ['health'],
	responses: {
		200: json(HealthSchema, 'Service is healthy'),
		500: errors[500],
	},
});
