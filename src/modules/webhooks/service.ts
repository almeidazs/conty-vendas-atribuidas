import { sha256 } from '../../lib/signature';
import type { Clock } from '../../types/clock';
import type { Db } from '../../types/db';
import type {
	OrderDetail,
	OrderOutcome,
	OrderRow,
	OrderWebhook,
	Refund,
	RefundOutcome,
	RefundRow,
	RefundWebhook,
} from '../../types/sales';
import { attribute, contyUtmCode, normalizeCoupon } from '../attribution/rule';
import { loadOrderDetail, presentRefund } from '../orders/presenter';
import {
	createOrdersRepository,
	type OrdersRepository,
} from '../orders/repository';

// O objeto utm aceita campos extras da loja; só os conhecidos são gravados.
const knownUtm = (utm: OrderWebhook['utm']) =>
	utm
		? {
				source: utm.source ?? null,
				medium: utm.medium ?? null,
				campaign: utm.campaign ?? null,
				content: utm.content ?? null,
				term: utm.term ?? null,
			}
		: null;

/** Status da loja que significam pagamento capturado. O resto não vira venda. */
const PAID = new Set(['paid', 'partially_refunded', 'refunded']);

/**
 * Aplica um estorno à venda, limitado ao que ainda resta dela. O estorno
 * sempre fica registrado com o valor pedido; só o aplicado sai da venda.
 */
const applyRefund = async (
	repo: OrdersRepository,
	order: OrderRow,
	refund: Pick<RefundRow, 'id' | 'requestedCents' | 'currency'>,
	now: Date,
): Promise<'applied' | 'rejected'> => {
	if (refund.currency !== order.currency) {
		await repo.updateRefund(refund.id, {
			status: 'rejected',
			rejectionReason: `currency ${refund.currency} differs from order currency ${order.currency}`,
		});
		return 'rejected';
	}
	const remaining = order.totalCents - (await repo.appliedCents(order.id));
	const applied = Math.max(0, Math.min(refund.requestedCents, remaining));
	await repo.updateRefund(refund.id, {
		status: 'applied',
		appliedCents: applied,
		appliedAt: now,
	});
	await repo.insertEntry({
		orderId: order.id,
		creatorId: order.creatorId,
		kind: 'refund',
		amountCents: -applied,
		refundId: refund.id,
		createdAt: now,
	});
	return 'applied';
};

export const createWebhooksService = (db: Db, clock: Clock) => ({
	/**
	 * A primeira versão paga do pedido cria a venda e fixa a atribuição. Toda
	 * entrega vira evento; repetidas nunca somam de novo nem trocam o criador.
	 */
	ingestOrder(raw: string, payload: OrderWebhook) {
		return db.transaction(
			async (
				tx,
			): Promise<{ result: OrderOutcome; order: OrderDetail }> => {
				const repo = createOrdersRepository(tx);
				const now = clock.now();
				const hash = await sha256(raw);
				await repo.lock(payload.id);

				const existing = await repo.order(payload.id);
				const result: OrderOutcome = existing
					? existing.payloadHash === hash
						? 'duplicate'
						: 'duplicate_changed'
					: PAID.has(payload.financial_status)
						? 'credited'
						: 'not_paid';

				if (result === 'credited') {
					const couponCodes = payload.discount_codes.map(
						(d) => d.code,
					);
					const utmCode = contyUtmCode(payload.utm ?? null);
					const [coupons, utmCodes] = await Promise.all([
						repo.couponOwners([
							...new Set(couponCodes.map(normalizeCoupon)),
						]),
						repo.utmOwners(utmCode),
					]);
					const attribution = attribute(
						{ couponCodes, utm: payload.utm ?? null },
						{ coupons, utmCodes },
					);
					const order: OrderRow = {
						id: payload.id,
						financialStatus: payload.financial_status,
						totalCents: payload.total_price,
						currency: payload.currency,
						couponCodes,
						utm: knownUtm(payload.utm),
						creatorId: attribution.creatorId,
						attributionReason: attribution.reason,
						attributedCoupon: attribution.coupon,
						conflictCreatorId: attribution.conflictCreatorId,
						payloadHash: hash,
						paidAt: now,
					};
					await repo.insertOrder(order);
					await repo.insertEntry({
						orderId: order.id,
						creatorId: order.creatorId,
						kind: 'sale',
						amountCents: order.totalCents,
						createdAt: now,
					});
					// Estornos que chegaram antes do pedido, na ordem em que chegaram.
					for (const refund of await repo.refunds(order.id))
						if (refund.status === 'pending')
							await applyRefund(repo, order, refund, now);
				}

				await repo.insertEvent({
					topic: 'orders',
					externalId: payload.id,
					orderId: payload.id,
					payloadHash: hash,
					payload: raw,
					outcome: result,
					receivedAt: now,
				});
				return {
					result,
					order: (await loadOrderDetail(
						repo,
						payload.id,
					)) as OrderDetail,
				};
			},
		);
	},

	/**
	 * Estorno idempotente pelo id. Sem o pedido, fica pendente e é aplicado
	 * quando a venda chegar; com o pedido, sai da venda até o limite do que resta.
	 */
	ingestRefund(raw: string, payload: RefundWebhook) {
		return db.transaction(
			async (
				tx,
			): Promise<{
				result: RefundOutcome;
				refund: Refund;
				order: OrderDetail;
			}> => {
				const repo = createOrdersRepository(tx);
				const now = clock.now();
				const hash = await sha256(raw);
				await repo.lock(payload.order_id);

				const known = await repo.refund(payload.id);
				let result: RefundOutcome;
				if (known) {
					result =
						known.payloadHash === hash
							? 'duplicate'
							: 'duplicate_changed';
				} else {
					const refund = {
						id: payload.id,
						orderId: payload.order_id,
						requestedCents: payload.amount,
						currency: payload.currency,
						status: 'pending' as const,
						refundedAt: payload.created_at
							? new Date(payload.created_at)
							: null,
						receivedAt: now,
						payloadHash: hash,
					};
					await repo.insertRefund(refund);
					const order = await repo.order(payload.order_id);
					result = order
						? await applyRefund(repo, order, refund, now)
						: 'pending';
				}

				// Id de estorno repetido conta como o estorno original, mesmo que aponte outro pedido.
				const orderId = known?.orderId ?? payload.order_id;
				await repo.insertEvent({
					topic: 'refunds',
					externalId: payload.id,
					orderId,
					payloadHash: hash,
					payload: raw,
					outcome: result,
					receivedAt: now,
				});
				return {
					result,
					refund: presentRefund(
						(await repo.refund(payload.id)) as RefundRow,
					),
					order: (await loadOrderDetail(
						repo,
						orderId,
					)) as OrderDetail,
				};
			},
		);
	},
});
