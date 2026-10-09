import { createApp } from '../src/app';
import { env } from '../src/config/env';
import { sign } from '../src/lib/signature';
import type { CreatorSummary, OrderDetail, Refund } from '../src/types/sales';

export const WEBHOOK_SECRET = 'test-webhook-secret';

export const bindings = {
	HYPERDRIVE: { connectionString: env.DATABASE_URL },
	WEBHOOK_SECRET,
};

/** Relógio controlado: os testes decidem o "agora" e podem avançá-lo. */
export const fixedClock = (iso: string) => {
	let now = new Date(iso);
	return {
		now: () => now,
		set: (next: string) => {
			now = new Date(next);
		},
		advance: (ms: number) => {
			now = new Date(now.getTime() + ms);
		},
	};
};

export type ErrorBody = { code: string; message: string; errors?: unknown };

export const readJson = async <T>(res: Response) => (await res.json()) as T;

export const setup = (now = '2026-10-10T12:00:00.000Z') => {
	const clock = fixedClock(now);
	const app = createApp({ clock });

	const request = (
		method: string,
		path: string,
		{
			body,
			raw,
			headers = {},
		}: {
			body?: unknown;
			raw?: string;
			headers?: Record<string, string>;
		} = {},
	) =>
		app.request(
			path,
			{
				method,
				headers: { 'content-type': 'application/json', ...headers },
				body:
					raw ??
					(body === undefined ? undefined : JSON.stringify(body)),
			},
			bindings,
		);

	/** Webhook assinado como a loja assinaria: HMAC do corpo bruto exato. */
	const webhook = async (
		topic: 'orders' | 'refunds',
		payload: unknown,
		raw?: string,
	) => {
		const body = raw ?? JSON.stringify(payload);
		return request('POST', `/webhooks/${topic}`, {
			raw: body,
			headers: {
				'x-webhook-signature': await sign(WEBHOOK_SECRET, body),
			},
		});
	};

	return { app, clock, request, webhook };
};

export const request = setup().request;

export type OrderPayload = {
	id: string | number;
	total_price: string | number;
	currency: string;
	financial_status: string;
	discount_codes: { code: string }[];
	utm: {
		source?: string | null;
		medium?: string | null;
		campaign?: string | null;
		content?: string | null;
		term?: string | null;
	} | null;
	[extra: string]: unknown;
};

export type RefundPayload = {
	id: string | number;
	order_id: string | number;
	amount: string | number;
	currency: string;
	created_at?: string;
	[extra: string]: unknown;
};

/** Pedido pago em BRL, sem cupom nem UTM, com o que o teste quiser sobrescrever. */
export const order = (overrides: Partial<OrderPayload> = {}): OrderPayload => ({
	id: '1001',
	total_price: '100.00',
	currency: 'BRL',
	financial_status: 'paid',
	discount_codes: [],
	utm: null,
	...overrides,
});

export const refund = (
	overrides: Partial<RefundPayload> = {},
): RefundPayload => ({
	id: 'rf_1',
	order_id: '1001',
	amount: '10.00',
	currency: 'BRL',
	...overrides,
});

export const contyUtm = (content: string) => ({
	source: 'conty',
	medium: 'social',
	campaign: 'launch',
	content,
	term: null,
});

type Api = ReturnType<typeof setup>;

export const createCreator = async (
	{ request }: Api,
	body: { name: string; utm_code: string; coupons?: string[] },
) => {
	const res = await request('POST', '/creators', { body });
	if (res.status !== 201)
		throw new Error(
			`createCreator failed: ${res.status} ${await res.text()}`,
		);
	return readJson<CreatorSummary>(res);
};

export const getOrder = async ({ request }: Api, id: string) => {
	const res = await request('GET', `/orders/${id}`);
	if (res.status !== 200)
		throw new Error(`getOrder failed: ${res.status} ${await res.text()}`);
	return readJson<OrderDetail>(res);
};

export const listCreators = async ({ request }: Api) =>
	readJson<CreatorSummary[]>(await request('GET', '/creators'));

export type OrderResult = { result: string; order: OrderDetail };
export type RefundResult = {
	result: string;
	refund: Refund;
	order: OrderDetail;
};

export const sumApplied = (refunds: Refund[]) =>
	refunds.reduce((total, r) => total + (r.appliedCents ?? 0), 0);
