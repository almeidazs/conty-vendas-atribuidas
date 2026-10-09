import type {
	OrderDetail,
	OrderRow,
	Refund,
	RefundRow,
	Sale,
	WebhookEvent,
	WebhookEventRow,
} from '../../types/sales';
import type { OrdersRepository } from './repository';

const iso = (date: Date | null) => (date ? date.toISOString() : null);

export const attributionStatus = (
	totalCents: number,
	refundedCents: number,
) => {
	if (refundedCents === 0) return 'active' as const;
	return refundedCents >= totalCents
		? ('reversed' as const)
		: ('partially_refunded' as const);
};

export const presentRefund = (row: RefundRow): Refund => ({
	id: row.id,
	orderId: row.orderId,
	status: row.status,
	requestedCents: row.requestedCents,
	appliedCents: row.appliedCents,
	excessCents:
		row.appliedCents === null
			? null
			: row.requestedCents - row.appliedCents,
	currency: row.currency,
	rejectionReason: row.rejectionReason,
	refundedAt: iso(row.refundedAt),
	receivedAt: row.receivedAt.toISOString(),
	appliedAt: iso(row.appliedAt),
});

const presentEvent = (row: WebhookEventRow): WebhookEvent => ({
	id: row.id,
	topic: row.topic,
	externalId: row.externalId,
	outcome: row.outcome,
	payloadHash: row.payloadHash,
	receivedAt: row.receivedAt.toISOString(),
});

const presentSale = (
	order: OrderRow,
	refunds: RefundRow[],
	names: Map<string, string>,
): Sale => {
	const refundedCents = refunds.reduce(
		(total, refund) =>
			refund.status === 'applied'
				? total + (refund.appliedCents ?? 0)
				: total,
		0,
	);
	const ref = (id: string | null) =>
		id ? { id, name: names.get(id) ?? '' } : null;
	return {
		financialStatus: order.financialStatus,
		currency: order.currency,
		totalCents: order.totalCents,
		refundedCents,
		netCents: order.totalCents - refundedCents,
		attributionStatus: attributionStatus(order.totalCents, refundedCents),
		creator: ref(order.creatorId),
		attribution: {
			reason: order.attributionReason,
			coupon: order.attributedCoupon,
			utmContent: order.utm?.content ?? null,
			conflict: ref(order.conflictCreatorId),
		},
		couponCodes: order.couponCodes,
		paidAt: order.paidAt.toISOString(),
	};
};

/** Tudo o que se sabe do pedido: a venda (se já foi paga), os estornos e cada webhook. */
export const loadOrderDetail = async (
	repo: OrdersRepository,
	id: string,
): Promise<OrderDetail | undefined> => {
	const [order, refunds, events] = await Promise.all([
		repo.order(id),
		repo.refunds(id),
		repo.events(id),
	]);
	if (!order && !refunds.length && !events.length) return;
	const creatorIds = order
		? [order.creatorId, order.conflictCreatorId].filter(
				(value): value is string => value !== null,
			)
		: [];
	const names = await repo.creatorNames(creatorIds);
	return {
		id,
		sale: order ? presentSale(order, refunds, names) : null,
		refunds: refunds.map(presentRefund),
		events: events.map(presentEvent),
	};
};
