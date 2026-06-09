import pg from 'pg'
import type { VideoGenerationJob, VideoGenerationJobStatus } from '../../../server/utils/video-generation/types'

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

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String)
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed.map(String) : []
    } catch {
      return []
    }
  }
  return []
}

function mapJob(row: any): VideoGenerationJob {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    projectId: row.project_id,
    timelineId: row.timeline_id ?? null,
    createdBy: row.created_by,
    status: row.status as VideoGenerationJobStatus,
    mode: row.mode,
    modelId: row.model_id,
    provider: row.provider,
    prompt: row.prompt,
    sourceAssetIds: asStringArray(row.source_asset_ids),
    durationSeconds: Number(row.duration_seconds),
    aspectRatio: row.aspect_ratio,
    resolution: row.resolution ?? null,
    subjectType: row.subject_type,
    complianceStatus: row.compliance_status,
    complianceReasons: asStringArray(row.compliance_reasons),
    estimatedCostCents: Number(row.estimated_cost_cents),
    actualCostCents: row.actual_cost_cents == null ? null : Number(row.actual_cost_cents),
    idempotencyKey: row.idempotency_key,
    providerRequestId: row.provider_request_id ?? null,
    providerStatus: row.provider_status ?? null,
    providerResultUrl: row.provider_result_url ?? null,
    outputAssetId: row.output_asset_id ?? null,
    outputR2Key: row.output_r2_key ?? null,
    errorMessage: row.error_message ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    startedAt: row.started_at ?? null,
    completedAt: row.completed_at ?? null,
  }
}

export async function dbGetVideoGenerationJob(id: string): Promise<VideoGenerationJob | null> {
  const row = await queryOne(`SELECT * FROM video_generation_jobs WHERE id = $1`, [id])
  return row ? mapJob(row) : null
}

export async function dbMarkVideoGenerationJobRunning(id: string, providerRequestId?: string | null): Promise<VideoGenerationJob> {
  const row = await queryOne(
    `UPDATE video_generation_jobs
     SET status = 'running', provider_request_id = COALESCE($2, provider_request_id),
         provider_status = 'running', started_at = COALESCE(started_at, now()), updated_at = now()
     WHERE id = $1 RETURNING *`,
    [id, providerRequestId ?? null]
  )
  if (!row) throw new Error(`video generation job ${id} not found`)
  return mapJob(row)
}

export async function dbMarkVideoGenerationJobFailed(id: string, errorMessage: string): Promise<VideoGenerationJob> {
  const row = await queryOne(
    `UPDATE video_generation_jobs
     SET status = 'failed', error_message = $2, completed_at = now(), updated_at = now()
     WHERE id = $1 RETURNING *`,
    [id, errorMessage]
  )
  if (!row) throw new Error(`video generation job ${id} not found`)
  return mapJob(row)
}

export async function dbMarkVideoGenerationJobSucceeded(input: {
  id: string
  providerStatus: string
  providerResultUrl: string
  outputAssetId: string | null
  outputR2Key: string | null
  actualCostCents: number | null
}): Promise<VideoGenerationJob> {
  const row = await queryOne(
    `UPDATE video_generation_jobs
     SET status = 'succeeded', provider_status = $2, provider_result_url = $3,
         output_asset_id = $4, output_r2_key = $5, actual_cost_cents = $6,
         completed_at = now(), updated_at = now()
     WHERE id = $1 RETURNING *`,
    [input.id, input.providerStatus, input.providerResultUrl, input.outputAssetId, input.outputR2Key, input.actualCostCents]
  )
  if (!row) throw new Error(`video generation job ${input.id} not found`)
  return mapJob(row)
}

export async function dbCreateVideoAsset(input: {
  clientId: string | null
  createdBy: string
  title: string | null
  sourceProjectId: string | null
  sourceJobId: string | null
  r2Key: string
  format: string
  width: number | null
  height: number | null
  durationSec: number | null
}): Promise<{ id: string; r2Key: string }> {
  const row = await queryOne<{ id: string; r2_key: string }>(
    `INSERT INTO video_assets
       (client_id, created_by, title, source_project_id, source_job_id, r2_key, format, width, height, duration_sec)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING id, r2_key`,
    [
      input.clientId,
      input.createdBy,
      input.title,
      input.sourceProjectId,
      input.sourceJobId,
      input.r2Key,
      input.format,
      input.width,
      input.height,
      input.durationSec,
    ]
  )
  if (!row) throw new Error('failed to create video asset')
  return { id: row.id, r2Key: row.r2_key }
}
