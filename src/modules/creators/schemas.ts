import { z } from '@hono/zod-openapi';
import { PageQuerySchema, PaginationSchema } from '../../lib/openapi';
import { safeString } from '../../lib/validation';
import { normalizeCoupon, normalizeUtmCode } from '../attribution/rule';

export const CreateCreatorSchema = z
	.object({
		name: safeString(200).trim().min(1).openapi({ example: 'Ana Souza' }),
		utm_code: z
			.string()
			.transform(normalizeUtmCode)
			.pipe(
				z
					.string()
					.regex(
						/^[a-z0-9][a-z0-9._-]{0,49}$/,
						'Letters, digits, ".", "_" or "-", up to 50 characters',
					),
			)
			.openapi({ type: 'string', example: 'ana' }),
		coupons: z
			.array(
				safeString(50)
					.transform(normalizeCoupon)
					.pipe(z.string().min(1, 'Coupon cannot be blank')),
			)
			.max(20)
			.default([])
			.transform((codes) => [...new Set(codes)])
			.openapi({ example: ['ANA10'] }),
	})
	.strict()
	.openapi('CreateCreator');

export const CreatorSchema = z
	.object({
		id: z.uuid(),
		name: z.string(),
		utmCode: z.string().openapi({ example: 'ana' }),
		coupons: z.array(z.string()).openapi({ example: ['ANA10'] }),
		createdAt: z.iso.datetime({ offset: true }),
	})
	.openapi('Creator');

export const TotalsSchema = z
	.object({
		currency: z.string().openapi({ example: 'BRL' }),
		orders: z.number().int(),
		grossCents: z.number().int(),
		refundedCents: z.number().int(),
		netCents: z.number().int(),
	})
	.openapi('Totals');

export const CreatorSummarySchema = CreatorSchema.extend({
	totals: z
		.array(TotalsSchema)
		.openapi({ description: 'One row per currency.' }),
}).openapi('CreatorSummary');

export const SaleItemSchema = z
	.object({
		orderId: z.string(),
		currency: z.string(),
		totalCents: z.number().int(),
		refundedCents: z.number().int(),
		netCents: z.number().int(),
		attributionStatus: z.enum(['active', 'partially_refunded', 'reversed']),
		reason: z.enum(['coupon', 'utm']),
		paidAt: z.iso.datetime({ offset: true }),
	})
	.openapi('SaleItem');

export const CreatorSalesSchema = z
	.object({
		creator: CreatorSummarySchema,
		data: z.array(SaleItemSchema),
		pagination: PaginationSchema,
	})
	.openapi('CreatorSales');

export const CreatorParamsSchema = z.object({
	id: z.uuid().openapi({ param: { name: 'id', in: 'path' } }),
});

export const CreatorSalesQuerySchema = PageQuerySchema;
