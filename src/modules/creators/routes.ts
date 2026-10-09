import { createRoute, z } from '@hono/zod-openapi';
import { errors, json } from '../../lib/openapi';
import {
	CreateCreatorSchema,
	CreatorParamsSchema,
	CreatorSalesQuerySchema,
	CreatorSalesSchema,
	CreatorSummarySchema,
} from './schemas';

const tags = ['creators'];

export const createCreator = createRoute({
	method: 'post',
	path: '/creators',
	operationId: 'createCreator',
	summary: 'Register a creator with coupons and a UTM code',
	description:
		'Coupons are matched case-insensitively and belong to one creator only. The UTM code is the utm_content of the creator links (with utm_source=conty).',
	tags,
	request: {
		body: { required: true, ...json(CreateCreatorSchema, 'Creator') },
	},
	responses: {
		201: json(CreatorSummarySchema, 'The creator'),
		400: errors[400],
		409: errors[409],
		415: errors[415],
		500: errors[500],
	},
});

export const listCreators = createRoute({
	method: 'get',
	path: '/creators',
	operationId: 'listCreators',
	summary: 'List creators with gross, refunded and net sales',
	tags,
	responses: {
		200: json(z.array(CreatorSummarySchema), 'Creators'),
		500: errors[500],
	},
});

export const creatorSales = createRoute({
	method: 'get',
	path: '/creators/{id}/sales',
	operationId: 'getCreatorSales',
	summary: 'Sales attributed to a creator',
	description: 'Most recent first, with what was refunded from each one.',
	tags,
	request: { params: CreatorParamsSchema, query: CreatorSalesQuerySchema },
	responses: {
		200: json(CreatorSalesSchema, 'The creator and their sales'),
		400: errors[400],
		404: errors[404],
		500: errors[500],
	},
});
