import { Pool } from '@neondatabase/serverless'

// Database connection pool
let pool: Pool | null = null

export function getDb() {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL
    if (!connectionString) {
      throw new Error('DATABASE_URL is not defined')
    }
    pool = new Pool({ connectionString })
  }
  return pool
}

// Query helper
export async function query<T = any>(sql: string, params?: any[]): Promise<T[]> {
  const db = getDb()
  const result = await db.query(sql, params)
  return result.rows
}

// Alias for query for compatibility
export const queryRows = query

// Single row query helper
export async function queryOne<T = any>(sql: string, params?: any[]): Promise<T | null> {
  const rows = await query<T>(sql, params)
  return rows[0] || null
}

// Query helper that returns a count value
export async function queryCount(sql: string, params?: any[]): Promise<number> {
  const result = await query<{ count: string }>(sql, params)
  return parseInt(result[0]?.count || '0', 10)
}

// Execute helper for INSERT/UPDATE/DELETE (returns row count)
export async function execute(sql: string, params?: any[]): Promise<number> {
  const db = getDb()
  const result = await db.query(sql, params)
  return result.rowCount || 0
}

// Transaction helper
export async function transaction<T>(callback: (db: Pool) => Promise<T>): Promise<T> {
  const db = getDb()
  const client = await db.connect()
  
  try {
    await client.query('BEGIN')
    const result = await callback(client as any)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

// Export pool wrapper for compatibility with existing code
export const db = {
  query: async (sql: string, params?: any[]) => {
    const db = getDb()
    return db.query(sql, params)
  }
}
