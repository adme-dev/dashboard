import pg from 'pg'
import type { Database } from './emailConfiguration'

export async function withManagementTransaction<T>(connectionString: string, work: (db: Database) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString, connectionTimeoutMillis: 10_000, query_timeout: 15_000 })
  let connectionFailure: Error | undefined
  client.on('error', (error) => {
    connectionFailure = error
  })
  const query = async (sql: string, values?: unknown[]) => {
    if (connectionFailure) throw connectionFailure
    const result = await client.query(sql, values)
    if (connectionFailure) throw connectionFailure
    return result
  }
  try {
    await client.connect()
    await query('BEGIN')
    try {
      await query('SET LOCAL search_path TO public, pg_catalog')
      await query('SET LOCAL statement_timeout=\'10s\'')
      await query('SET LOCAL lock_timeout=\'2s\'')
      await query('SET LOCAL idle_in_transaction_session_timeout=\'15s\'')
      const result = await work({ query })
      await query('COMMIT')
      return result
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {})
      throw error
    }
  } finally { await client.end().catch(() => {}) }
}
