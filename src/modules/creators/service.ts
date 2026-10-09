import { ErrorCode } from '../../errors';
import type { Clock } from '../../types/clock';
import type { Db } from '../../types/db';
import type {
	CreateCreatorInput,
	CreatorRow,
	CreatorSales,
	CreatorSummary,
} from '../../types/sales';
import { attributionStatus } from '../orders/presenter';
import {
	type CreatorsRepository,
	createCreatorsRepository,
} from './repository';

type Result<T, C extends ErrorCode> =
	| { ok: true; value: T }
	| { ok: false; code: C; errors?: unknown };

const summaries = async (
	repo: CreatorsRepository,
	rows: CreatorRow[],
): Promise<CreatorSummary[]> => {
	const ids = rows.map((row) => row.id);
	const [coupons, totals] = await Promise.all([
		repo.coupons(ids),
		repo.totals(ids),
	]);
	return rows.map((row) => ({
		id: row.id,
		name: row.name,
		utmCode: row.utmCode,
		coupons: coupons
			.filter((c) => c.creatorId === row.id)
			.map((c) => c.code),
		createdAt: row.createdAt.toISOString(),
		totals: totals
			.filter((t) => t.creatorId === row.id)
			.map(({ creatorId: _, ...rest }) => rest),
	}));
};

type PgError = { code?: string; constraint_name?: string };

/** Violação de unique do Postgres (corrida entre dois cadastros com o mesmo código). */
const uniqueViolation = (error: unknown): PgError | undefined => {
	const candidates = [
		error,
		(error as { cause?: unknown })?.cause,
	] as PgError[];
	return candidates.find((candidate) => candidate?.code === '23505');
};

export const createCreatorsService = (db: Db, clock: Clock) => {
	const snapshot = <T>(read: (repo: CreatorsRepository) => Promise<T>) =>
		db.transaction((tx) => read(createCreatorsRepository(tx)), {
			isolationLevel: 'repeatable read',
			accessMode: 'read only',
		});

	return {
		async create(
			input: CreateCreatorInput,
		): Promise<
			Result<
				CreatorSummary,
				ErrorCode.UTM_CODE_TAKEN | ErrorCode.COUPON_TAKEN
			>
		> {
			try {
				return await db.transaction(async (tx) => {
					const repo = createCreatorsRepository(tx);
					if (await repo.byUtmCode(input.utm_code))
						return {
							ok: false,
							code: ErrorCode.UTM_CODE_TAKEN,
						} as const;
					const taken = await repo.takenCoupons(input.coupons);
					if (taken.length)
						return {
							ok: false,
							code: ErrorCode.COUPON_TAKEN,
							errors: { coupons: taken.map((t) => t.code) },
						} as const;
					const creator = await repo.insert(
						{
							name: input.name,
							utmCode: input.utm_code,
							createdAt: clock.now(),
						},
						input.coupons,
					);
					const [summary] = await summaries(repo, [creator]);
					return {
						ok: true,
						value: summary as CreatorSummary,
					} as const;
				});
			} catch (error) {
				// Dois cadastros simultâneos com o mesmo código: o segundo perde no unique.
				const violation = uniqueViolation(error);
				if (violation)
					return {
						ok: false,
						code: violation.constraint_name?.startsWith(
							'creators_utm_code',
						)
							? ErrorCode.UTM_CODE_TAKEN
							: ErrorCode.COUPON_TAKEN,
					};
				throw error;
			}
		},

		list: () => snapshot(async (repo) => summaries(repo, await repo.all())),

		sales: (
			id: string,
			page: number,
			perPage: number,
		): Promise<CreatorSales | undefined> =>
			snapshot(async (repo) => {
				const creator = await repo.find(id);
				if (!creator) return;
				const [[summary], { rows, total }] = await Promise.all([
					summaries(repo, [creator]),
					repo.sales(id, page, perPage),
				]);
				return {
					creator: summary as CreatorSummary,
					data: rows.map(({ order, refundedCents }) => ({
						orderId: order.id,
						currency: order.currency,
						totalCents: order.totalCents,
						refundedCents,
						netCents: order.totalCents - refundedCents,
						attributionStatus: attributionStatus(
							order.totalCents,
							refundedCents,
						),
						reason: order.attributionReason as 'coupon' | 'utm',
						paidAt: order.paidAt.toISOString(),
					})),
					pagination: {
						page,
						perPage,
						total,
						pageCount: Math.ceil(total / perPage),
					},
				};
			}),
	};
};
