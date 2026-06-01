// workers/audio-jobs/src/db.ts
// Worker-local DB adapter (pg over the Hyperdrive connection string stashed on
// globalThis by index.ts). Raw TCP to Neon isn't possible in a Worker without
// Hyperdrive. Mirrors workers/leads-delivery-worker/src/db.ts.
import pg from 'pg'

let _client: pg.Client | null = null
let _connectPromise: Promise<pg.Client> | null = null

function getConnectionString(): string {
  const cs = (globalThis as any).__HYPERDRIVE_CS || process.env.DATABASE_URL
  if (!cs) throw new Error('No HYPERDRIVE connection string or DATABASE_URL')
  return cs
}

async function getClient(): Promise<pg.Client> {
  if (_client) return _client
  if (_connectPromise) return _connectPromise
  _connectPromise = (async () => {
    const c = new pg.Client({ connectionString: getConnectionString() })
    await c.connect()
    _client = c
    _connectPromise = null
    return c
  })()
  return _connectPromise
}

export async function queryRows<T = any>(sql: string, params?: any[]): Promise<T[]> {
  const c = await getClient()
  const result = await c.query<any>(sql, params)
  return result.rows as T[]
}

export async function queryOne<T = any>(sql: string, params?: any[]): Promise<T | null> {
  const rows = await queryRows<T>(sql, params)
  return rows[0] ?? null
}

export async function execute(sql: string, params?: any[]): Promise<number> {
  const c = await getClient()
  const result = await c.query(sql, params)
  return result.rowCount ?? 0
}
