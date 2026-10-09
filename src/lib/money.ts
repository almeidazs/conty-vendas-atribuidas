// Até 13 dígitos inteiros e 2 decimais: cabe em Number sem perder precisão.
const DECIMAL = /^(\d{1,13})(?:\.(\d{1,2}))?$/;

/**
 * Converte o valor da loja ("149.90", como a Shopify manda) para centavos
 * inteiros sem passar por float. Número também vale, desde que a forma
 * textual dele seja exata (149.9 vale, 0.1 + 0.2 não).
 */
export const toCents = (value: string | number): number | undefined => {
	const match = DECIMAL.exec(String(value).trim());
	if (!match) return;
	const [, units, decimals = ''] = match;
	return Number(units) * 100 + Number(decimals.padEnd(2, '0'));
};

export const formatCents = (cents: number) =>
	`${Math.trunc(cents / 100)}.${String(Math.abs(cents % 100)).padStart(2, '0')}`;
