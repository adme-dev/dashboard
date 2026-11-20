// workers/audio-jobs/src/db.ts
// Worker-local DB adapter (pg over the Hyperdrive connection string stashed on
// globalThis by index.ts). Raw TCP to Neon isn't possible in a Worker without
// Hyperdrive. Mirrors workers/leads-delivery-worker/src/db.ts.
import pg from 'pg'
import { RenderPublicationUncertainError, type VideoRenderProgress } from '../../../shared/video/renderExecution'

function getConnectionString(): string {
  const cs = (globalThis as any).__HYPERDRIVE_CS || process.env.DATABASE_URL
  if (!cs) throw new Error('No HYPERDRIVE connection string or DATABASE_URL')
  return cs
}

async function withClient<T>(run: (client: pg.Client) => Promise<T>): Promise<T> {
  // A Worker isolate outlives an individual queue delivery. A pg.Client kept in
  // module scope can carry a closed socket and promises from an expired request.
  const client = new pg.Client({ connectionString: getConnectionString(), connectionTimeoutMillis: 5_000, statement_timeout: 15_000, query_timeout: 20_000 })
  try {
    await client.connect()
    return await run(client)
  } finally {
    await client.end().catch(() => {})
  }
}

export async function queryRows<T = any>(sql: string, params?: any[]): Promise<T[]> {
  return withClient(async (client) => {
    const result = await client.query<any>(sql, params)
    return result.rows as T[]
  })
}

export async function queryOne<T = any>(sql: string, params?: any[]): Promise<T | null> {
  const rows = await queryRows<T>(sql, params)
  return rows[0] ?? null
}

export async function execute(sql: string, params?: any[]): Promise<number> {
  return withClient(async (client) => {
    const result = await client.query(sql, params)
    return result.rowCount ?? 0
  })
}

export interface WorkerAiInvocationInput {
  featureKey: string
  provider: string
  modelId: string
  gatewayUsed?: boolean
  userId?: string | null
  clientId?: string | null
  requestId?: string | null
  status?: 'success' | 'error'
  errorCode?: string | null
  latencyMs?: number | null
  metadata?: Record<string, unknown> | null
}

export async function dbRecordAiInvocation(input: WorkerAiInvocationInput): Promise<void> {
  try {
    await execute(
      `INSERT INTO ai_invocations (
         feature_key, provider, model_id, gateway_used,
         user_id, client_id, request_id, status, error_code, latency_ms, metadata
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)`,
      [
        input.featureKey,
        input.provider,
        input.modelId,
        Boolean(input.gatewayUsed),
        input.userId ?? null,
        input.clientId ?? null,
        input.requestId ?? null,
        input.status ?? 'success',
        input.errorCode ?? null,
        input.latencyMs == null ? null : Math.max(0, Math.round(Number(input.latencyMs))),
        JSON.stringify(input.metadata ?? {}),
      ]
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!message.includes('ai_invocations')) console.warn('audio-jobs.ai-invocation-record-failed', message)
  }
}

// Render-job status writers (Hyperdrive→Neon). Mirror the music writers' execute() usage.
export async function dbMarkRenderRendering(jobId: string, attemptId?: string): Promise<void> {
  await execute(`UPDATE media_render_jobs SET status='rendering', error=NULL,
    progress=CASE WHEN $2::text IS NULL THEN progress ELSE jsonb_build_object('attemptId',$2::text) END,
    updated_at=now() WHERE id=$1 AND status <> 'done' AND ($2::text IS NOT NULL OR progress->>'attemptId' IS NULL)`, [jobId, attemptId ?? null])
}
export async function dbMarkRenderProgress(jobId: string, progress: Record<string, unknown> | VideoRenderProgress): Promise<void> {
  const sequence = typeof progress.sequence === 'number' && Number.isSafeInteger(progress.sequence) && progress.sequence >= 0 ? progress.sequence : 0
  await execute(`UPDATE media_render_jobs SET progress=$1::jsonb, updated_at=now() WHERE id=$2
    AND (status IN ('queued','rendering') OR (status='done' AND $1::jsonb->>'stage'='done'))
    AND (($3::text IS NULL AND progress->>'attemptId' IS NULL) OR progress->>'attemptId'=$3::text)
    AND COALESCE((progress->>'sequence')::bigint,0) <= $4::bigint`,
    [JSON.stringify(progress), jobId, typeof progress.attemptId === 'string' ? progress.attemptId : null, sequence])
}
export async function dbMarkRenderDone(jobId: string, variants: Record<string, string>, costCents: number | null, attemptId?: string): Promise<void> {
  let changed: number
  try { changed = await execute(
    `UPDATE media_render_jobs SET status='done', variants=$1::jsonb, cost_cents=$2, error=NULL, updated_at=now() WHERE id=$3
      AND (($4::text IS NULL AND progress->>'attemptId' IS NULL) OR (status='rendering' AND progress->>'attemptId'=$4::text))`,
    [JSON.stringify(variants), costCents, jobId, attemptId ?? null]
  )
  } catch {
    // The UPDATE may have committed before its response was lost. Keep bytes
    // until the authoritative loader reconciles the persisted job on retry.
    throw new RenderPublicationUncertainError('Render publication response unavailable')
  }
  if (attemptId && !changed) throw new Error('Render attempt is no longer current')
}
export async function dbMarkVideoRenderFailed(jobId: string, error: string, attemptId?: string): Promise<boolean> {
  const changed = await execute(`UPDATE media_render_jobs SET status='failed', error=$1, updated_at=now() WHERE id=$2 AND status <> 'done'
    AND (($3::text IS NULL AND progress->>'attemptId' IS NULL) OR progress->>'attemptId'=$3::text)`, [error, jobId, attemptId ?? null])
  return changed > 0
}
export async function dbMarkRenderFailed(jobId: string, error: string, attemptId?: string): Promise<void> {
  await dbMarkVideoRenderFailed(jobId, error, attemptId)
}
export async function dbLoadTimelineState(timelineId: string): Promise<any> {
  const row = await queryOne<{ state: any }>(`SELECT state FROM media_timelines WHERE id=$1`, [timelineId])
  if (!row) throw new Error(`timeline ${timelineId} not found`)
  return row.state
}

// Banner render-job writers (#2a). Mirror the media-render writers' execute() usage.
export interface BannerJobDb {
  id: string; project_id: string; format_key: string; width: number; height: number
  fps: number; crf: number; quality: number; source_r2_key: string; status: string; created_by: string
}
export async function dbLoadBannerJob(jobId: string): Promise<BannerJobDb | null> {
  const rows = await queryRows<BannerJobDb>(
    `SELECT id, project_id, format_key, width, height, fps, crf, quality, source_r2_key, status, created_by
       FROM banner_render_jobs WHERE id=$1`, [jobId])
  return rows[0] ?? null
}
export async function dbMarkBannerRendering(jobId: string): Promise<string | null> {
  const rows = await queryRows<{ token: string }>(
    `UPDATE banner_render_jobs SET status='rendering', started_at=GREATEST(clock_timestamp(), started_at + interval '1 microsecond'), updated_at=now(), error=NULL
       WHERE id=$1 AND (status IN ('queued', 'failed')
         OR (status='rendering' AND updated_at <= now() - interval '15 minutes'))
       RETURNING started_at::text AS token`, [jobId])
  // Keep PostgreSQL's exact timestamp text; converting through Date loses precision.
  return rows[0]?.token ?? null
}
export async function dbRenewBannerLease(jobId: string, token: string): Promise<boolean> {
  const rows = await queryRows<{ id: string }>(
    `UPDATE banner_render_jobs SET updated_at=now()
      WHERE id=$1 AND status='rendering' AND started_at=$2::timestamptz
        AND updated_at > now() - interval '15 minutes' RETURNING id`, [jobId, token])
  return rows.length > 0
}
export async function dbMarkBannerDone(jobId: string, token: string, o: { r2Key: string, url: string, size: number }): Promise<boolean> {
  // Lock and fence the claim, then insert its export and settle the job atomically.
  const rows = await queryRows<{ id: string }>(
    `WITH owned AS (
       SELECT * FROM banner_render_jobs WHERE id=$1 AND status='rendering'
         AND started_at=$2::timestamptz AND updated_at > now() - interval '15 minutes' FOR UPDATE
     ), exported AS (
       INSERT INTO banner_exports (project_id, format_key, r2_key, url, file_size, export_type, quality, exported_by)
       SELECT project_id, format_key, $3, $4, $5, 'mp4', quality, created_by FROM owned RETURNING id
     )
     UPDATE banner_render_jobs SET status='done', r2_key=$3, url=$4, file_size=$5,
       export_id=exported.id, finished_at=now(), updated_at=now()
     FROM owned, exported WHERE banner_render_jobs.id=owned.id RETURNING banner_render_jobs.id`,
    [jobId, token, o.r2Key, o.url, o.size])
  return rows.length > 0
}
export async function dbMarkBannerFailed(jobId: string, token: string, error: string): Promise<void> {
  await execute(`UPDATE banner_render_jobs SET status='failed', error=$3, finished_at=now(), updated_at=now()
    WHERE id=$1 AND status='rendering' AND started_at=$2::timestamptz
      AND updated_at > now() - interval '15 minutes'`, [jobId, token, error])
}

export async function dbMarkBannerDeferred(jobId: string, token: string): Promise<void> {
  await execute(`UPDATE banner_render_jobs SET status='queued', error=NULL, updated_at=now()
    WHERE id=$1 AND status='rendering' AND started_at=$2::timestamptz`, [jobId, token])
}
