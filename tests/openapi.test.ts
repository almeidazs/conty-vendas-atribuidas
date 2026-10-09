import { expect, test } from 'vitest';
import { request } from './helpers';

type Operation = {
	operationId?: string;
	summary?: string;
	tags?: string[];
	responses: Record<string, unknown>;
};

test('every operation is fully documented', async () => {
	const spec = (await (await request('GET', '/openapi.json')).json()) as {
		paths: Record<string, Record<string, Operation>>;
	};
	const operations = Object.values(spec.paths).flatMap((path) =>
		Object.values(path),
	);

	expect(operations.length).toBeGreaterThan(0);
	for (const operation of operations) {
		expect(operation.operationId).toBeTruthy();
		expect(operation.summary).toBeTruthy();
		expect(operation.tags?.length).toBeGreaterThan(0);
		expect(operation.responses['500']).toBeDefined();
	}
});

test('serves the API reference', async () => {
	const res = await request('GET', '/docs');
	expect(res.status).toBe(200);
});
