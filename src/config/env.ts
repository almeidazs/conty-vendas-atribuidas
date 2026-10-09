import { cleanEnv, url } from 'envalid';

// Env do lado Node (migrations, drizzle-kit e testes). O Worker recebe bindings via `c.env`.
try {
	process.loadEnvFile();
} catch {
	// Sem .env (ex.: CI): usa só as variáveis do processo.
}

export const env = cleanEnv(process.env, {
	DATABASE_URL: url({ desc: 'Postgres connection string' }),
});
