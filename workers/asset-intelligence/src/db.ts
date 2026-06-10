import pg from 'pg'
import type { AssetIntelligenceWorkerJob } from './providers'
import type { AssetIntelligenceClaim, CreateDerivativeInput } from './worker'

declare const process: { env: Record<string, string | undefined> }

let client: pg.Client | null = null
let connectPromise: Promise<pg.Client> | null = null

function getConnectionString(): string {
  const cs = (globalThis as any).__HYPERDRIVE_CS || process.env.DATABASE_URL
  if (!cs) throw new Error('No HYPERDRIVE connection string or DATABASE_URL')
  return cs
}

async function getClient(): Promise<pg.Client> {
  if (client) return client
  if (connectPromise) return connectPromise
  connectPromise = (async () => {
    const c = new pg.Client({ connectionString: getConnectionString() })
    await c.connect()
    client = c
    connectPromise = null
    return c
  })()
  return connectPromise
}

async function queryRows<T = any>(sql: string, params?: any[]): Promise<T[]> {
  const c = await getClient()
  const result = await c.query(sql, params)
  return result.rows as T[]
}

async function queryOne<T = any>(sql: string, params?: any[]): Promise<T | null> {
  const rows = await queryRows<T>(sql, params)
  return rows[0] ?? null
}

function mapJob(row: any): AssetIntelligenceWorkerJob & AssetIntelligenceClaim {
  return {
    id: row.id,
    projectId: row.project_id,
    sourceAssetId: row.source_asset_id ?? null,
    action: row.action,
    modelId: row.model_id,
    provider: row.provider,
    prompt: row.prompt ?? null,
    brushMaskKey: row.brush_mask_key ?? null,
    status: row.status,
  }
}

export async function getAssetIntelligenceJob(id: string): Promise<AssetIntelligenceWorkerJob | null> {
  const row = await queryOne(`SELECT * FROM video_asset_intelligence_jobs WHERE id = $1`, [id])
  return row ? mapJob(row) : null
}

export async function markAssetIntelligenceJobRunning(id: string): Promise<AssetIntelligenceClaim> {
  const row = await queryOne(
    `UPDATE video_asset_intelligence_jobs
        SET status = 'running',
            started_at = COALESCE(started_at, now()),
            updated_at = now()
      WHERE id = $1 AND status = 'queued'
      RETURNING *`,
    [id]
  )
  if (!row) {
    const existing = await queryOne(`SELECT * FROM video_asset_intelligence_jobs WHERE id = $1`, [id])
    if (!existing) throw new Error(`asset intelligence job ${id} not found`)
    return mapJob(existing)
  }
  return mapJob(row)
}

export async function markAssetIntelligenceJobFailed(id: string, errorMessage: string): Promise<AssetIntelligenceClaim> {
  const row = await queryOne(
    `UPDATE video_asset_intelligence_jobs
        SET status = 'failed',
            error_message = $2,
            completed_at = now(),
            updated_at = now()
      WHERE id = $1 AND status IN ('queued','running')
      RETURNING *`,
    [id, errorMessage]
  )
  if (!row) {
    const existing = await queryOne(`SELECT * FROM video_asset_intelligence_jobs WHERE id = $1`, [id])
    if (!existing) throw new Error(`asset intelligence job ${id} not found`)
    return mapJob(existing)
  }
  return mapJob(row)
}

export async function markAssetIntelligenceJobSucceeded(input: {
  id: string
  outputDerivativeIds: string[]
}): Promise<AssetIntelligenceClaim> {
  const row = await queryOne(
    `UPDATE video_asset_intelligence_jobs
        SET status = 'succeeded',
            output_derivative_ids = $2::jsonb,
            error_message = null,
            completed_at = now(),
            updated_at = now()
      WHERE id = $1 AND status IN ('queued','running')
      RETURNING *`,
    [input.id, JSON.stringify(input.outputDerivativeIds)]
  )
  if (!row) {
    const existing = await queryOne(`SELECT * FROM video_asset_intelligence_jobs WHERE id = $1`, [input.id])
    if (!existing) throw new Error(`asset intelligence job ${input.id} not found`)
    return mapJob(existing)
  }
  return mapJob(row)
}

export async function createDerivative(input: CreateDerivativeInput): Promise<{ id: string }> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO video_asset_derivatives
       (source_asset_id, project_id, kind, r2_key, width, height, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)
     RETURNING id`,
    [
      input.sourceAssetId,
      input.projectId,
      input.kind,
      input.r2Key,
      input.width,
      input.height,
      JSON.stringify(input.metadata ?? {}),
    ]
  )
  if (!row) throw new Error('failed to create asset derivative')
  return { id: row.id }
}

export async function getVideoAssetR2Key(sourceAssetId: string): Promise<string> {
  const row = await queryOne<{ r2_key: string }>(
    `SELECT r2_key FROM video_assets WHERE id = $1`,
    [sourceAssetId]
  )
  if (!row?.r2_key) throw new Error(`video asset ${sourceAssetId} has no R2 key`)
  return row.r2_key
}
