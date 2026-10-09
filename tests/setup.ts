import postgres from 'postgres';
import { afterAll, beforeEach } from 'vitest';
import { env } from '../src/config/env';

const sql = postgres(env.DATABASE_URL, { onnotice: () => {} });

beforeEach(async () => {
	const tables = await sql<{ tablename: string }[]>`
		select tablename from pg_tables
		where schemaname = 'public' and tablename <> '__drizzle_migrations'`;

	if (tables.length)
		await sql.unsafe(
			`truncate ${tables.map((t) => `"${t.tablename}"`).join(', ')} restart identity cascade`,
		);
});

afterAll(() => sql.end());
