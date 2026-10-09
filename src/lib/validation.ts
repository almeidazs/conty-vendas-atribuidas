import { z } from '@hono/zod-openapi';
import { toCents } from './money';

// Postgres não aceita o caractere NUL em text nem em jsonb: sem isso ele virava 500.
export const safeString = (max: number) =>
	z
		.string()
		.max(max)
		.refine(
			(value) => !value.includes('\u0000'),
			'NUL characters are not allowed',
		);

/** Valor em reais como a loja manda ("149.90" ou 149.9), convertido para centavos. */
export const amount = z
	.union([z.string(), z.number()])
	.transform((value, ctx) => {
		const cents = toCents(value);
		if (cents !== undefined) return cents;
		ctx.addIssue({
			code: 'custom',
			message:
				'Use a decimal amount with up to 2 decimal places, like "149.90"',
		});
		return z.NEVER;
	})
	.openapi({ type: 'string', example: '149.90' });

export const currency = z
	.string()
	.regex(/^[A-Za-z]{3}$/, 'Use an ISO 4217 code, like "BRL"')
	.transform((value) => value.toUpperCase())
	.openapi({ type: 'string', example: 'BRL' });

/** Id da loja: a Shopify manda número; aqui vira texto. */
export const externalId = z
	.union([safeString(100).trim().min(1), z.number().int().nonnegative()])
	.transform(String)
	.openapi({ type: 'string', example: '5551234' });
