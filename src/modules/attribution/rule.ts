/**
 * A regra de atribuição, num lugar só. Função pura: recebe o que o pedido
 * trouxe e quem é dono de cada código, e devolve no máximo um criador.
 *
 * 1. Cupom: vence o primeiro cupom do pedido que pertence a um criador, na
 *    ordem em que a loja aplicou. O comprador digitou o cupom no checkout,
 *    então é a intenção mais explícita e o último toque antes da compra.
 * 2. UTM: só vale link de criador da Conty (utm_source=conty), e o criador é
 *    identificado por utm_content. UTM de outra origem é ignorada.
 * 3. Nenhum dos dois: a venda fica sem criador.
 *
 * Quando cupom e UTM apontam para criadores diferentes, o cupom vence e o
 * criador da UTM fica registrado como conflito.
 */

export const CONTY_UTM_SOURCE = 'conty';

export type AttributionInput = {
	couponCodes: readonly string[];
	utm: { source?: string | null; content?: string | null } | null;
};

/** Donos dos códigos, já normalizados: cupom → criador e utm_content → criador. */
export type CodeOwners = {
	coupons: ReadonlyMap<string, string>;
	utmCodes: ReadonlyMap<string, string>;
};

export type Attribution = {
	creatorId: string | null;
	reason: 'coupon' | 'utm' | 'none';
	coupon: string | null;
	utmContent: string | null;
	conflictCreatorId: string | null;
};

export const normalizeCoupon = (code: string) => code.trim().toUpperCase();

export const normalizeUtmCode = (value: string) => value.trim().toLowerCase();

/** O utm_content do pedido, só quando o link é da Conty. */
export const contyUtmCode = (utm: AttributionInput['utm']) => {
	if (!utm?.source || !utm.content) return null;
	if (normalizeUtmCode(utm.source) !== CONTY_UTM_SOURCE) return null;
	return normalizeUtmCode(utm.content) || null;
};

export const attribute = (
	input: AttributionInput,
	owners: CodeOwners,
): Attribution => {
	const utmContent = contyUtmCode(input.utm);
	const utmCreatorId = utmContent
		? (owners.utmCodes.get(utmContent) ?? null)
		: null;

	for (const raw of input.couponCodes) {
		const coupon = normalizeCoupon(raw);
		const creatorId = owners.coupons.get(coupon);
		if (!creatorId) continue;
		return {
			creatorId,
			reason: 'coupon',
			coupon,
			utmContent,
			conflictCreatorId:
				utmCreatorId && utmCreatorId !== creatorId
					? utmCreatorId
					: null,
		};
	}

	if (utmCreatorId)
		return {
			creatorId: utmCreatorId,
			reason: 'utm',
			coupon: null,
			utmContent,
			conflictCreatorId: null,
		};

	return {
		creatorId: null,
		reason: 'none',
		coupon: null,
		utmContent,
		conflictCreatorId: null,
	};
};
