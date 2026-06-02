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

// Render-job status writers (Hyperdrive→Neon). Mirror the music writers' execute() usage.
export async function dbMarkRenderRendering(jobId: string): Promise<void> {
  await execute(`UPDATE media_render_jobs SET status='rendering', updated_at=now() WHERE id=$1`, [jobId])
}
export async function dbMarkRenderDone(jobId: string, variants: Record<string, string>, costCents: number | null): Promise<void> {
  await execute(
    `UPDATE media_render_jobs SET status='done', variants=$1::jsonb, cost_cents=$2, updated_at=now() WHERE id=$3`,
    [JSON.stringify(variants), costCents, jobId]
  )
}
export async function dbMarkRenderFailed(jobId: string, error: string): Promise<void> {
  await execute(`UPDATE media_render_jobs SET status='failed', error=$1, updated_at=now() WHERE id=$2`, [error, jobId])
}
export async function dbLoadTimelineState(timelineId: string): Promise<any> {
  const row = await queryOne<{ state: any }>(`SELECT state FROM media_timelines WHERE id=$1`, [timelineId])
  if (!row) throw new Error(`timeline ${timelineId} not found`)
  return row.state
}
