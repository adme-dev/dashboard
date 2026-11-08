import pg from 'pg'
import { AsyncLocalStorage } from 'node:async_hooks'
import {
  CLAIM_VIDEO_GENERATION_SUBMISSION_SQL,
  MARK_VIDEO_GENERATION_FAILED_SQL,
  MARK_VIDEO_GENERATION_RUNNING_SQL,
  MARK_VIDEO_GENERATION_SUCCEEDED_SQL,
  MARK_VIDEO_GENERATION_UNKNOWN_SQL,
  explicitActualCostCents,
  readVideoGenerationLiability,
  readVideoGenerationSourceAssetIds,
} from '../../../shared/video/generationLiability'
import {
  stampVideoGenerationTransition,
  type VideoGenerationJob,
  type VideoGenerationJobStatus,
} from '../../../server/utils/video-generation/types'

// A connection belongs to one query/request, never a module-global Worker isolate.
const connectionScope = new AsyncLocalStorage<string>()
export function withVideoGenerationDatabase<T>(connectionString: string, run: () => Promise<T>): Promise<T> {
  return connectionScope.run(connectionString, run)
}
async function queryRows<T = any>(sql: string, params?: any[]): Promise<T[]> {
  const connectionString = connectionScope.getStore()
  if (!connectionString) throw new Error('Video generation database context unavailable')
  const client = new pg.Client({ connectionString, connectionTimeoutMillis: 10000 })
  try {
    await client.connect()
    return (await client.query(sql, params)).rows as T[]
  } finally {
    await client.end().catch(() => undefined)
  }
}

async function queryOne<T = any>(sql: string, params?: any[]): Promise<T | null> {
  const rows = await queryRows<T>(sql, params)
  return rows[0] ?? null
}

export interface WorkerAiInvocationInput {
  featureKey: string
  provider: string
  modelId: string
  gatewayUsed?: boolean
  fallbackUsed?: boolean
  userId?: string | null
  clientId?: string | null
  requestId?: string | null
  estimatedCostUsd?: number | null
  status?: 'success' | 'error'
  errorCode?: string | null
  latencyMs?: number | null
  metadata?: Record<string, unknown> | null
}

export async function dbRecordAiInvocation(input: WorkerAiInvocationInput): Promise<void> {
  try {
    await queryRows(
      `INSERT INTO ai_invocations (
         feature_key, provider, model_id, gateway_used, fallback_used,
         user_id, client_id, request_id, estimated_cost_usd, status,
         error_code, latency_ms, metadata
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb)`,
      [
        input.featureKey,
        input.provider,
        input.modelId,
        Boolean(input.gatewayUsed),
        Boolean(input.fallbackUsed),
        input.userId ?? null,
        input.clientId ?? null,
        input.requestId ?? null,
        input.estimatedCostUsd ?? null,
        input.status ?? 'success',
        input.errorCode ?? null,
        input.latencyMs == null ? null : Math.max(0, Math.round(Number(input.latencyMs))),
        JSON.stringify(input.metadata ?? {}),
      ]
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!message.includes('ai_invocations')) console.warn('video-generation.ai-invocation-record-failed')
  }
}

function mapJob(row: any): VideoGenerationJob {
  const estimatedCostCents = Number(row.estimated_cost_cents)
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
    sourceAssetIds: readVideoGenerationSourceAssetIds(row.source_asset_ids),
    durationSeconds: Number(row.duration_seconds),
    aspectRatio: row.aspect_ratio,
    resolution: row.resolution ?? null,
    subjectType: row.subject_type,
    complianceStatus: row.compliance_status,
    complianceReasons: readVideoGenerationSourceAssetIds(row.compliance_reasons),
    estimatedCostCents,
    actualCostCents: row.actual_cost_cents == null ? null : Number(row.actual_cost_cents),
    ...readVideoGenerationLiability(row, estimatedCostCents),
    idempotencyKey: row.idempotency_key,
    providerRequestId: row.provider_request_id ?? null,
    providerStatus: row.provider_status ?? null,
    providerResultUrl: row.provider_result_url ?? null,
    outputAssetId: row.output_asset_id ?? null,
    outputR2Key: row.output_r2_key ?? null,
    outputSha256: row.output_sha256 ?? null,
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

async function updateJobOrCurrent(sql: string, params: unknown[], id: string): Promise<VideoGenerationJob> {
  const row = await queryOne(sql, params)
  if (row) return stampVideoGenerationTransition(mapJob(row), true)
  const existing = await dbGetVideoGenerationJob(id)
  if (!existing) throw new Error(`video generation job ${id} not found`)
  return stampVideoGenerationTransition(existing, false)
}

export async function dbClaimVideoGenerationSubmission(id: string): Promise<VideoGenerationJob | null> {
  const row = await queryOne(CLAIM_VIDEO_GENERATION_SUBMISSION_SQL, [id])
  return row ? mapJob(row) : null
}

export async function dbMarkVideoGenerationJobRunning(id: string, providerRequestId?: string | null): Promise<VideoGenerationJob> {
  return updateJobOrCurrent(MARK_VIDEO_GENERATION_RUNNING_SQL, [id, providerRequestId ?? null], id)
}

export async function dbMarkVideoGenerationJobUnknown(
  id: string,
  errorMessage: string,
  providerRequestId?: string | null,
): Promise<VideoGenerationJob> {
  return updateJobOrCurrent(MARK_VIDEO_GENERATION_UNKNOWN_SQL, [id, errorMessage, providerRequestId ?? null], id)
}

export async function dbMarkVideoGenerationJobFailed(
  id: string,
  errorMessage: string,
  actualCostCents?: number | null,
): Promise<VideoGenerationJob> {
  const explicit = explicitActualCostCents(actualCostCents)
  return updateJobOrCurrent(MARK_VIDEO_GENERATION_FAILED_SQL, [id, errorMessage, explicit != null, explicit], id)
}

export async function dbMarkVideoGenerationJobSucceeded(input: {
  id: string
  providerStatus: string
  providerResultUrl: string
  outputAssetId: string | null
  outputR2Key: string | null
  outputSha256?: string | null
  actualCostCents: number | null
}): Promise<VideoGenerationJob> {
  return updateJobOrCurrent(MARK_VIDEO_GENERATION_SUCCEEDED_SQL, [
    input.id,
    input.providerStatus,
    input.providerResultUrl,
    input.outputAssetId,
    input.outputR2Key,
    input.actualCostCents,
    input.outputSha256 ?? null,
  ], input.id)
}

export async function dbCreateVideoAsset(input: {
  clientId: string | null
  createdBy: string
  title: string | null
  sourceProjectId: string | null
  sourceJobId: string | null
  r2Key: string
  outputSha256?: string | null
  format: string
  width: number | null
  height: number | null
  durationSec: number | null
}): Promise<{ id: string; r2Key: string }> {
  const row = await queryOne<{ id: string; r2_key: string }>(
    `INSERT INTO video_assets
       (client_id, created_by, title, source_project_id, source_job_id, r2_key, format, width, height, duration_sec, generated_output_sha256)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT (source_job_id, generated_output_sha256)
       WHERE source_job_id IS NOT NULL AND generated_output_sha256 IS NOT NULL
     DO UPDATE SET generated_output_sha256 = EXCLUDED.generated_output_sha256
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
      input.outputSha256 ?? null,
    ]
  )
  if (!row) throw new Error('failed to create video asset')
  return { id: row.id, r2Key: row.r2_key }
}
