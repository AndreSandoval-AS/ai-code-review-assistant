import { Pool, QueryResult, QueryResultRow } from 'pg';
import { logger } from './logger';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 2_000,
});

pool.on('error', (err) => {
  logger.error({ err }, 'Unexpected database pool error');
});

/**
 * Execute a parameterized query. All database access must go through this
 * helper to enforce parameterized queries and centralize connection management.
 *
 * @param text  The SQL query with $1, $2, ... placeholders.
 * @param params  The parameter values corresponding to the placeholders.
 */
export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<QueryResult<T>> {
  const start = Date.now();
  try {
    const result = await pool.query<T>(text, params);
    logger.debug({ query: text, duration: Date.now() - start, rows: result.rowCount }, 'db query');
    return result;
  } catch (err) {
    logger.error({ err, query: text }, 'db query failed');
    throw err;
  }
}

/** Acquire a client for multi-statement transactions. */
export async function getClient() {
  return pool.connect();
}
