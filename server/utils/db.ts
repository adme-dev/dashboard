import { Pool } from '@neondatabase/serverless'

// Database connection pool
let pool: Pool | null = null

export function getDb() {
  if (!pool) {
    // Prefer Hyperdrive binding (edge-optimized connection pooling) over direct DATABASE_URL
    const hyperdrive = (globalThis as any).process?.env?.HYPERDRIVE_URL
      || (process.env as any).HYPERDRIVE?.connectionString
    const connectionString = hyperdrive || process.env.DATABASE_URL
    if (!connectionString) {
      throw new Error('DATABASE_URL is not defined')
    }
    pool = new Pool({
      connectionString,
      connectionTimeoutMillis: 10000,  // 10s — enough for Neon cold start wake-up
      max: 1,                          // Single connection — avoids cross-request promise issues on CF Workers
      idleTimeoutMillis: 10000,        // Close idle connections quickly (before Neon/CF resets them)
      allowExitOnIdle: true,           // Let pool shrink to 0 when all connections idle
    })
    // Catch background connection resets so they don't become unhandled rejections
    pool.on('error', (err) => {
      console.warn('[DB Pool] Background connection error:', err.message)
      try { pool?.end() } catch {}
      pool = null
    })
  }
  return pool
}

// Retry a DB operation with exponential backoff (handles Neon cold start)
const MAX_RETRIES = 3
const BASE_DELAY_MS = 300

function isRetryable(error: any): boolean {
  const msg = String(error?.message || '')
  return (
    msg.includes('fetch failed') ||
    msg.includes('ECONNREFUSED') ||
    msg.includes('ECONNRESET') ||
    msg.includes('ETIMEDOUT') ||
    msg.includes('socket hang up') ||
    msg.includes('Connection terminated unexpectedly') ||
    msg.includes('sorry, too many clients already') ||
    msg.includes('remaining connection slots are reserved') ||
    msg.includes('the database system is starting up') ||
    msg.includes('Client has encountered a connection error') ||
    msg.includes('Network request failed') ||
    error?.code === 'ECONNREFUSED' ||
    error?.code === 'ECONNRESET' ||
    error?.code === 'ETIMEDOUT' ||
    error?.code === 'UND_ERR_CONNECT_TIMEOUT'
  )
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: any
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      if (attempt < MAX_RETRIES && isRetryable(error)) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt) // 300, 600, 1200ms
        await new Promise(resolve => setTimeout(resolve, delay))
        // Reset pool on connection errors so next attempt gets a fresh connection
        if (pool) {
          try { pool.end() } catch {}
          pool = null
        }
        continue
      }
      throw error
    }
  }
  throw lastError
}

// Query helper
export async function query<T = any>(sql: string, params?: any[]): Promise<T[]> {
  return withRetry(async () => {
    const db = getDb()
    const result = await db.query(sql, params)
    return result.rows
  })
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
  return withRetry(async () => {
    const db = getDb()
    const result = await db.query(sql, params)
    return result.rowCount || 0
  })
}

// Transaction helper
export async function transaction<T>(callback: (db: Pool) => Promise<T>): Promise<T> {
  return withRetry(async () => {
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
  })
}

// Export pool wrapper for compatibility with existing code
export const db = {
  query: async (sql: string, params?: any[]) => {
    return withRetry(async () => {
      const db = getDb()
      return db.query(sql, params)
    })
  }
}
