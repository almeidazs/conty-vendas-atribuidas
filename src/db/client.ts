import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './tables';

export const createDb = (url: string) => {
	const sql = postgres(url, {
		max: 5,
		fetch_types: false,
		onnotice: () => {},
	});

	return { db: drizzle(sql, { schema, casing: 'snake_case' }), sql };
};
