import pg from 'pg'
import type { Database } from './emailConfiguration'

// Fixed SQL only: one protocol round trip sets all transaction-local guards.
// Keep business SQL parameterized and separate; never interpolate caller data here.
const transactionSetup = [
  'BEGIN',
  'SET LOCAL search_path TO public, pg_catalog',
  'SET LOCAL statement_timeout=\'10s\'',
  'SET LOCAL lock_timeout=\'2s\'',
  'SET LOCAL idle_in_transaction_session_timeout=\'15s\''
].join('; ')

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
    try {
      await query(transactionSetup)
      const result = await work({ query })
      await query('COMMIT')
      return result
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {})
      throw error
    }
  } finally { await client.end().catch(() => {}) }
}
