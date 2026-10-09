import type { createDb } from '../db/client';

export type Db = ReturnType<typeof createDb>['db'];
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
/** Qualquer coisa que executa query: o client ou uma transação aberta. */
export type Executor = Db | Tx;
