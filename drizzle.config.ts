import { defineConfig } from 'drizzle-kit';
import { env } from './src/config/env';

export default defineConfig({
	dialect: 'postgresql',
	schema: './src/db/tables/index.ts',
	out: './drizzle',
	casing: 'snake_case',
	dbCredentials: { url: env.DATABASE_URL },
});
