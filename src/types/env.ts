import type { Clock } from './clock';
import type { Db } from './db';

export type Bindings = {
	HYPERDRIVE: { connectionString: string };
	WEBHOOK_SECRET: string;
};

export type AppEnv = {
	Bindings: Bindings;
	Variables: { db: Db; clock: Clock };
};
