import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { env } from '../config/env';
import { createDb } from './client';

const { db, sql } = createDb(env.DATABASE_URL);

await migrate(db, { migrationsFolder: 'drizzle' });
await sql.end();

console.log('migrations applied');
