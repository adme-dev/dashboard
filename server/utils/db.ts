import { neon, Pool } from '@neondatabase/serverless'
import pg from 'pg'

export type DatabaseFreshness = 'cached' | 'fresh'

export function resolveHyperdriveConnectionString(
  env: Record<string, any>,
  freshness: DatabaseFreshness
): string | null {
  const binding = freshness === 'fresh' ? env.HYPERDRIVE_FRESH : env.HYPERDRIVE
  return binding?.connectionString || null
}

// ============================================================================
// Dual-driver DB layer: Hyperdrive (TCP via pg) → neon() HTTP fallback
//
// In production on Cloudflare Workers, the HYPERDRIVE binding provides a TCP
// connection string that routes through Cloudflare's edge connection pool.
// We use the `pg` driver (TCP) for this — ~9x faster than neon() HTTP.
//
// In local dev (no HYPERDRIVE binding), we fall back to the neon() HTTP driver
// which is stateless and works without TCP/WebSocket support.
// ============================================================================

// --- Neon HTTP driver (local dev fallback) ---
function getConnectionString(): string {
  const cs = process.env.DATABASE_URL
  if (!cs) throw new Error('DATABASE_URL is not defined')
  return cs
}

let _sql: ReturnType<typeof neon> | null = null

function getSql() {
  if (!_sql) {
    _sql = neon(getConnectionString(), { fullResults: true })
  }
  return _sql
}

// --- Hyperdrive TCP connection (production) ---
// Accesses the HYPERDRIVE binding from the Cloudflare execution context via
// Nitro's useEvent(). Returns null when not in a request context or when
// the binding isn't available (local dev, SSR prerender, etc.)

function getHyperdriveCs(freshness: DatabaseFreshness = 'cached'): string | null {
  try {
    // useEvent() is auto-imported by Nitro in server/utils/
    const event = useEvent()
    const env = (event.context as any).cloudflare?.env || {}
    return resolveHyperdriveConnectionString(env, freshness)
  } catch {
    return null
  }
}

// Per-request pg Client, cached on event.context to avoid reconnecting per query.
// Hyperdrive manages the actual TCP connection pool — we just create a lightweight
// Client wrapper per request.
async function getHyperdriveClient(
  freshness: DatabaseFreshness = 'cached'
): Promise<pg.Client | null> {
  try {
    const event = useEvent()
    const contextKey = freshness === 'fresh' ? '_pgClientFresh' : '_pgClient'

    // Return cached client for this request
    if (event.context[contextKey]) return event.context[contextKey] as pg.Client

    const env = (event.context as any).cloudflare?.env || {}
    const cs = resolveHyperdriveConnectionString(env, freshness)
    if (!cs) return null

    const client = new pg.Client({ connectionString: cs })
    await client.connect()

    // Cache on event context — reused for all queries in this request
    event.context[contextKey] = client
    return client
  } catch {
    return null
  }
}

// Clear cached Hyperdrive client (called on connection errors during retry)
function clearHyperdriveClient() {
  try {
    const event = useEvent()
    for (const key of ['_pgClient', '_pgClientFresh']) {
      const client = event.context[key] as pg.Client | undefined
      if (client) {
        event.context[key] = null
        client.end().catch(() => {})
      }
    }
  } catch {}
}

export async function closeEventDatabaseClients(
  event: { context: Record<string, any> }
): Promise<void> {
  const closing: Promise<unknown>[] = []

  for (const key of ['_pgClient', '_pgClientFresh']) {
    const client = event.context[key] as pg.Client | undefined
    event.context[key] = null
    if (client) closing.push(client.end())
  }

  await Promise.allSettled(closing)
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
        // Reset both drivers on connection errors
        _sql = null
        clearHyperdriveClient()
        continue
      }
      throw error
    }
  }
  throw lastError
}

// --- Query helpers ---

// Query helper — returns rows. Uses Hyperdrive (TCP) when available, neon() HTTP otherwise.
async function queryWithFreshness<T>(
  freshness: DatabaseFreshness,
  sql: string,
  params?: any[]
): Promise<T[]> {
  return withRetry(async () => {
    const client = await getHyperdriveClient(freshness)
    if (client) {
      const result = await client.query(sql, params ?? [])
      return result.rows ?? []
    }
    // Fallback: neon() HTTP driver
    const sqlFn = getSql()
    const result = await sqlFn.query(sql, params ?? []) as any
    return result.rows ?? []
  })
}

export async function query<T = any>(sql: string, params?: any[]): Promise<T[]> {
  return queryWithFreshness<T>('cached', sql, params)
}

export async function queryFresh<T = any>(sql: string, params?: any[]): Promise<T[]> {
  return queryWithFreshness<T>('fresh', sql, params)
}

// Alias for query for compatibility
export const queryRows = query
export const queryRowsFresh = queryFresh

// Single row query helper
export async function queryOne<T = any>(sql: string, params?: any[]): Promise<T | null> {
  const rows = await query<T>(sql, params)
  return rows[0] || null
}

export async function queryOneFresh<T = any>(sql: string, params?: any[]): Promise<T | null> {
  const rows = await queryFresh<T>(sql, params)
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
    const client = await getHyperdriveClient('fresh')
    if (client) {
      const result = await client.query(sql, params ?? [])
      return result.rowCount ?? 0
    }
    const sqlFn = getSql()
    const result = await sqlFn.query(sql, params ?? []) as any
    return result.rowCount ?? 0
  })
}

// --- Transaction helper ---
// Uses a DEDICATED pg Client (not the shared per-request one) for BEGIN/COMMIT/ROLLBACK
// isolation. With Hyperdrive, uses TCP; without, falls back to Neon WebSocket Pool.
export async function transaction<T>(callback: (db: Pool) => Promise<T>): Promise<T> {
  return withRetry(async () => {
    const hdCs = getHyperdriveCs('fresh')

    if (hdCs) {
      // Hyperdrive path: dedicated pg Client over TCP
      const client = new pg.Client({ connectionString: hdCs })
      try {
        await client.connect()
        await client.query('BEGIN')
        const result = await callback(client as any)
        await client.query('COMMIT')
        return result
      } catch (error) {
        try { await client.query('ROLLBACK') } catch {}
        throw error
      } finally {
        client.end().catch(() => {})
      }
    }

    // Fallback: Neon Pool with WebSocket (local dev)
    const pool = new Pool({
      connectionString: getConnectionString(),
      max: 1,
    })

    // Catch pool-level errors to prevent unhandled rejections (Neon cold start / ECONNRESET)
    pool.on('error', () => {})

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

// --- Legacy getDb() — returns a Pool-like object backed by the active driver ---
export function getDb() {
  return {
    query: async (sql: string, params?: any[]) => {
      const client = await getHyperdriveClient()
      if (client) {
        return client.query(sql, params ?? [])
      }
      const sqlFn = getSql()
      return sqlFn.query(sql, params ?? []) as any
    }
  }
}

// Export pool wrapper for compatibility with existing code
export const db = {
  query: async (sql: string, params?: any[]) => {
    return withRetry(async () => {
      const client = await getHyperdriveClient()
      if (client) {
        return client.query(sql, params ?? [])
      }
      const sqlFn = getSql()
      return sqlFn.query(sql, params ?? []) as any
    })
  }
}
