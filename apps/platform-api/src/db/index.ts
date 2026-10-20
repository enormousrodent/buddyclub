import { Kysely, PostgresDialect, sql } from 'kysely';
import pg from 'pg';
import type { Database } from './schema.js';

export type Db = Kysely<Database>;
export type { Database } from './schema.js';

export interface DbOptions {
  connectionString: string;
  maxConnections?: number;
}

/** Creates the typed query layer (ADR-007). One instance per process; call `destroy()` on shutdown. */
export function createDb(options: DbOptions): Db {
  const pool = new pg.Pool({
    connectionString: options.connectionString,
    max: options.maxConnections ?? 10,
    // Statement timeouts keep a runaway query from pinning a connection; tune per environment.
    statement_timeout: 15_000,
  });
  return new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
}

export async function pingDb(db: Db): Promise<void> {
  await sql`select 1`.execute(db);
}
