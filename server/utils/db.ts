import { neon, Pool } from '@neondatabase/serverless'

// --- Connection string resolution ---
function getConnectionString(): string {
  const hyperdrive = (globalThis as any).process?.env?.HYPERDRIVE_URL
    || (process.env as any).HYPERDRIVE?.connectionString
  const connectionString = hyperdrive || process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error('DATABASE_URL is not defined')
  }
  return connectionString
}

// --- HTTP driver (stateless, perfect for CF Workers) ---
// neon() uses fetch() under the hood — no WebSocket, no persistent connection,
// no cross-request promise issues. Each query is an independent HTTP request.
let _sql: ReturnType<typeof neon> | null = null

function getSql() {
  if (!_sql) {
    _sql = neon(getConnectionString(), { fullResults: true })
  }
  return _sql
}

// --- Retry logic for transient errors (Neon cold start, network blips) ---
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
        // Reset HTTP driver on connection errors
        _sql = null
        continue
      }
      throw error
    }
  }
  throw lastError
}

// --- Query helpers (HTTP driver — stateless) ---

// Query helper — returns rows
export async function query<T = any>(sql: string, params?: any[]): Promise<T[]> {
  return withRetry(async () => {
    const sqlFn = getSql()
    const result = await sqlFn.query(sql, params ?? []) as any
    return result.rows ?? []
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
    const sqlFn = getSql()
    const result = await sqlFn.query(sql, params ?? []) as any
    return result.rowCount ?? 0
  })
}

// --- Transaction helper (uses fresh Pool, created and destroyed per-transaction) ---
// Interactive transactions need BEGIN/COMMIT/ROLLBACK which require a persistent
// connection. We create a short-lived Pool for this — it's slower but correct
// on CF Workers where WebSocket connections can't outlive a single request.
export async function transaction<T>(callback: (db: Pool) => Promise<T>): Promise<T> {
  return withRetry(async () => {
    const pool = new Pool({
      connectionString: getConnectionString(),
      max: 1,
    })

    try {
      const client = await pool.connect()
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
    } finally {
      // CRITICAL: always close the pool — don't hold WebSocket connections across requests
      await pool.end()
    }
  })
}

// --- Legacy getDb() — returns a Pool-like object backed by HTTP driver ---
// Some code may call getDb().query() directly. This shim routes through the HTTP driver.
export function getDb() {
  return {
    query: async (sql: string, params?: any[]) => {
      const sqlFn = getSql()
      return sqlFn.query(sql, params ?? []) as any
    }
  }
}

// Export pool wrapper for compatibility with existing code
export const db = {
  query: async (sql: string, params?: any[]) => {
    return withRetry(async () => {
      const sqlFn = getSql()
      return sqlFn.query(sql, params ?? []) as any
    })
  }
}
