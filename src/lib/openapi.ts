import { OpenAPIHono, z } from '@hono/zod-openapi';
import { badRequest, ErrorCode } from '../errors';
import type { AppEnv } from '../types/env';

export const ErrorSchema = z
	.object({
		code: z.enum(ErrorCode).openapi({ example: ErrorCode.ORDER_NOT_FOUND }),
		message: z.string().openapi({ example: 'Resource not found.' }),
		errors: z.unknown().optional(),
	})
	.openapi('Error');

export const PaginationSchema = z
	.object({
		page: z.number().int().openapi({ example: 1 }),
		perPage: z.number().int().openapi({ example: 20 }),
		total: z.number().int().openapi({ example: 42 }),
		pageCount: z.number().int().openapi({ example: 3 }),
	})
	.openapi('Pagination');

export const PageQuerySchema = z.object({
	page: z.coerce
		.number()
		.int()
		.min(1)
		.default(1)
		.openapi({ param: { name: 'page', in: 'query' }, example: 1 }),
	perPage: z.coerce
		.number()
		.int()
		.min(1)
		.max(100)
		.default(20)
		.openapi({ param: { name: 'perPage', in: 'query' }, example: 20 }),
});

export const json = <T extends z.ZodType>(schema: T, description: string) => ({
	description,
	content: { 'application/json': { schema } },
});

export const errors = {
	400: json(ErrorSchema, 'Invalid input (VALIDATION_FAILED, BAD_REQUEST)'),
	401: json(
		ErrorSchema,
		'Missing or invalid X-Webhook-Signature (INVALID_SIGNATURE)',
	),
	404: json(ErrorSchema, 'Not found'),
	409: json(ErrorSchema, 'Code already taken (UTM_CODE_TAKEN, COUPON_TAKEN)'),
	415: json(
		ErrorSchema,
		'Body is not application/json (UNSUPPORTED_MEDIA_TYPE)',
	),
	422: json(
		ErrorSchema,
		'Refund currency differs from the order currency (CURRENCY_MISMATCH). The refund is recorded as rejected; `errors` has it.',
	),
	500: json(ErrorSchema, 'Unexpected error'),
} as const;

// Router com validação padronizada: falhas do Zod viram o envelope de erro da API.
export const createRouter = () =>
	new OpenAPIHono<AppEnv>({
		defaultHook: (result, c) => {
			if (!result.success)
				return badRequest(
					c,
					ErrorCode.VALIDATION_FAILED,
					result.error.issues,
				);
		},
	});
