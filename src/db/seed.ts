import { env } from '../config/env';
import { createDb } from './client';
import { creatorCoupons, creators } from './tables';

// Criadores de exemplo para a demo. Idempotente: rodar de novo não duplica.
const SEED = [
	{ name: 'Ana Souza', utmCode: 'ana', coupons: ['ANA10'] },
	{
		name: 'Bruno Lima',
		utmCode: 'bruno',
		coupons: ['BRUNO15', 'BRUNOFRETE'],
	},
	{ name: 'Caio Rocha', utmCode: 'caio', coupons: ['CAIO'] },
];

const { db, sql } = createDb(env.DATABASE_URL);
for (const creator of SEED) {
	const [row] = await db
		.insert(creators)
		.values({ name: creator.name, utmCode: creator.utmCode })
		.onConflictDoUpdate({
			target: creators.utmCode,
			set: { name: creator.name },
		})
		.returning();
	if (row)
		await db
			.insert(creatorCoupons)
			.values(
				creator.coupons.map((code) => ({ code, creatorId: row.id })),
			)
			.onConflictDoNothing();
}
await sql.end();
console.log(`seeded ${SEED.length} creators`);
