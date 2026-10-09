import { describe, expect, test } from 'vitest';
import {
	type AttributionInput,
	attribute,
	type CodeOwners,
	contyUtmCode,
	normalizeCoupon,
	normalizeUtmCode,
} from '../src/modules/attribution/rule';

const ANA = 'creator-ana';
const BRUNO = 'creator-bruno';

const owners: CodeOwners = {
	coupons: new Map([
		['ANA10', ANA],
		['ANA20', ANA],
		['BRUNO15', BRUNO],
	]),
	utmCodes: new Map([
		['ana', ANA],
		['bruno', BRUNO],
	]),
};

const input = (
	couponCodes: string[],
	utm: AttributionInput['utm'] = null,
): AttributionInput => ({ couponCodes, utm });

const conty = (content: string | null) => ({ source: 'conty', content });

describe('attribute', () => {
	test('a creator coupon alone attributes the sale to its owner', () => {
		expect(attribute(input(['ANA10']), owners)).toEqual({
			creatorId: ANA,
			reason: 'coupon',
			coupon: 'ANA10',
			utmContent: null,
			conflictCreatorId: null,
		});
	});

	test('a Conty UTM alone attributes the sale to the creator in utm_content', () => {
		expect(attribute(input([], conty('bruno')), owners)).toEqual({
			creatorId: BRUNO,
			reason: 'utm',
			coupon: null,
			utmContent: 'bruno',
			conflictCreatorId: null,
		});
	});

	test('coupon beats UTM when they point to different creators, and the UTM creator is recorded as conflict', () => {
		expect(attribute(input(['ANA10'], conty('bruno')), owners)).toEqual({
			creatorId: ANA,
			reason: 'coupon',
			coupon: 'ANA10',
			utmContent: 'bruno',
			conflictCreatorId: BRUNO,
		});
	});

	test('the tie-break does not depend on the order of the inputs: coupon wins either way', () => {
		const a = attribute(input(['BRUNO15'], conty('ana')), owners);
		expect(a.creatorId).toBe(BRUNO);
		expect(a.conflictCreatorId).toBe(ANA);
	});

	test('coupon and UTM of the same creator agree, so there is no conflict', () => {
		expect(attribute(input(['ANA10'], conty('ana')), owners)).toEqual({
			creatorId: ANA,
			reason: 'coupon',
			coupon: 'ANA10',
			utmContent: 'ana',
			conflictCreatorId: null,
		});
	});

	test('among several creator coupons the first one applied by the store wins', () => {
		expect(attribute(input(['BRUNO15', 'ANA10']), owners)).toMatchObject({
			creatorId: BRUNO,
			coupon: 'BRUNO15',
		});
		expect(attribute(input(['ANA10', 'BRUNO15']), owners)).toMatchObject({
			creatorId: ANA,
			coupon: 'ANA10',
		});
	});

	test('coupons that belong to no creator are skipped in favour of a later creator coupon', () => {
		expect(
			attribute(input(['BLACKFRIDAY', 'FRETEGRATIS', 'BRUNO15']), owners),
		).toMatchObject({
			creatorId: BRUNO,
			reason: 'coupon',
			coupon: 'BRUNO15',
		});
	});

	test('when no coupon belongs to a creator the Conty UTM is used', () => {
		expect(
			attribute(input(['BLACKFRIDAY'], conty('ana')), owners),
		).toMatchObject({ creatorId: ANA, reason: 'utm', coupon: null });
	});

	test('a UTM from a source other than conty is ignored', () => {
		for (const source of ['instagram', 'google', 'conty-ads', '', null])
			expect(
				attribute(input([], { source, content: 'ana' }), owners),
			).toMatchObject({
				creatorId: null,
				reason: 'none',
				utmContent: null,
			});
	});

	test('a non-Conty UTM never creates a conflict with the coupon', () => {
		expect(
			attribute(
				input(['ANA10'], { source: 'instagram', content: 'bruno' }),
				owners,
			),
		).toMatchObject({ creatorId: ANA, conflictCreatorId: null });
	});

	test('coupons are matched ignoring case and surrounding whitespace', () => {
		expect(attribute(input(['  ana10 ']), owners)).toMatchObject({
			creatorId: ANA,
			coupon: 'ANA10',
		});
	});

	test('utm source and content are matched ignoring case and surrounding whitespace', () => {
		expect(
			attribute(
				input([], { source: ' CONTY ', content: '  Bruno ' }),
				owners,
			),
		).toMatchObject({
			creatorId: BRUNO,
			reason: 'utm',
			utmContent: 'bruno',
		});
	});

	test('a Conty UTM whose content is missing, blank or unknown attributes nothing', () => {
		for (const content of [null, '', '   ']) {
			expect(attribute(input([], conty(content)), owners)).toMatchObject({
				creatorId: null,
				reason: 'none',
				utmContent: null,
			});
		}
		expect(attribute(input([], conty('carla')), owners)).toEqual({
			creatorId: null,
			reason: 'none',
			coupon: null,
			utmContent: 'carla',
			conflictCreatorId: null,
		});
	});

	test('an order without coupons nor UTM has no creator', () => {
		expect(attribute(input([], null), owners)).toEqual({
			creatorId: null,
			reason: 'none',
			coupon: null,
			utmContent: null,
			conflictCreatorId: null,
		});
	});

	test('an unknown UTM creator does not count as a conflict', () => {
		expect(
			attribute(input(['ANA10'], conty('carla')), owners),
		).toMatchObject({ creatorId: ANA, conflictCreatorId: null });
	});

	test('it is pure: the same input always gives the same answer and inputs are not mutated', () => {
		const codes = ['x', 'ana10'];
		const frozen = Object.freeze(input(codes, conty('bruno')));
		const first = attribute(frozen, owners);
		expect(attribute(frozen, owners)).toEqual(first);
		expect(codes).toEqual(['x', 'ana10']);
	});
});

describe('normalization helpers', () => {
	test('coupons are trimmed and upper-cased', () => {
		expect(normalizeCoupon('  ana10\t')).toBe('ANA10');
	});

	test('UTM codes are trimmed and lower-cased', () => {
		expect(normalizeUtmCode(' Ana.Souza ')).toBe('ana.souza');
	});

	test('contyUtmCode returns the normalized content only for conty links', () => {
		expect(contyUtmCode({ source: 'Conty', content: ' ANA ' })).toBe('ana');
		expect(contyUtmCode({ source: 'tiktok', content: 'ana' })).toBeNull();
		expect(contyUtmCode({ source: 'conty' })).toBeNull();
		expect(contyUtmCode(null)).toBeNull();
	});
});
