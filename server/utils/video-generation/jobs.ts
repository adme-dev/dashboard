import { randomUUID } from 'node:crypto'
import { queryOne, queryRows } from '~~/server/utils/db'
import type {
  VideoGenerationJob,
  VideoGenerationJobStatus,
  VideoGenerationMode,
  VideoGenerationSubjectType,
} from '~~/server/utils/video-generation/types'

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

export function mapVideoGenerationJobRow(row: any): VideoGenerationJob {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    projectId: row.project_id,
    timelineId: row.timeline_id ?? null,
    createdBy: row.created_by,
    status: row.status as VideoGenerationJobStatus,
    mode: row.mode as VideoGenerationMode,
    modelId: row.model_id,
    provider: row.provider,
    prompt: row.prompt,
    sourceAssetIds: asStringArray(row.source_asset_ids),
    durationSeconds: Number(row.duration_seconds),
    aspectRatio: row.aspect_ratio,
    resolution: row.resolution ?? null,
    subjectType: row.subject_type as VideoGenerationSubjectType,
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

export interface CreateVideoGenerationJobInput {
  tenantId: string
  projectId: string
  timelineId: string | null
  createdBy: string
  status?: VideoGenerationJobStatus
  mode: VideoGenerationMode
  modelId: string
  provider: string
  prompt: string
  sourceAssetIds: string[]
  durationSeconds: number
  aspectRatio: string
  resolution: string | null
  subjectType: VideoGenerationSubjectType
  complianceStatus: string
  complianceReasons: string[]
  estimatedCostCents: number
  idempotencyKey: string
}

export async function createVideoGenerationJob(input: CreateVideoGenerationJobInput): Promise<VideoGenerationJob> {
  const row = await queryOne(
    `INSERT INTO video_generation_jobs (
       id, tenant_id, project_id, timeline_id, created_by, status, mode, model_id, provider,
       prompt, source_asset_ids, duration_seconds, aspect_ratio, resolution, subject_type,
       compliance_status, compliance_reasons, estimated_cost_cents, idempotency_key
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
     ON CONFLICT (tenant_id, idempotency_key) DO UPDATE SET updated_at = video_generation_jobs.updated_at
     RETURNING *`,
    [
      randomUUID(),
      input.tenantId,
      input.projectId,
      input.timelineId,
      input.createdBy,
      input.status ?? 'queued',
      input.mode,
      input.modelId,
      input.provider,
      input.prompt,
      JSON.stringify(input.sourceAssetIds),
      input.durationSeconds,
      input.aspectRatio,
      input.resolution,
      input.subjectType,
      input.complianceStatus,
      JSON.stringify(input.complianceReasons),
      input.estimatedCostCents,
      input.idempotencyKey,
    ]
  )
  return mapVideoGenerationJobRow(row)
}

export async function getVideoGenerationJob(id: string): Promise<VideoGenerationJob | null> {
  const row = await queryOne(`SELECT * FROM video_generation_jobs WHERE id = $1`, [id])
  return row ? mapVideoGenerationJobRow(row) : null
}

export async function getVideoGenerationJobByIdempotencyKey(
  tenantId: string,
  idempotencyKey: string
): Promise<VideoGenerationJob | null> {
  const row = await queryOne(
    `SELECT * FROM video_generation_jobs WHERE tenant_id = $1 AND idempotency_key = $2`,
    [tenantId, idempotencyKey]
  )
  return row ? mapVideoGenerationJobRow(row) : null
}

export async function markVideoGenerationJobRunning(id: string, providerRequestId?: string | null): Promise<VideoGenerationJob> {
  const row = await queryOne(
    `UPDATE video_generation_jobs
     SET status = 'running', provider_request_id = COALESCE($2, provider_request_id),
         provider_status = 'running', started_at = COALESCE(started_at, now()), updated_at = now()
     WHERE id = $1 RETURNING *`,
    [id, providerRequestId ?? null]
  )
  if (!row) throw new Error(`video generation job ${id} not found`)
  return mapVideoGenerationJobRow(row)
}

export async function markVideoGenerationJobSucceeded(input: {
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
     WHERE id = $1 AND status NOT IN ('succeeded','failed') RETURNING *`,
    [input.id, input.providerStatus, input.providerResultUrl, input.outputAssetId, input.outputR2Key, input.actualCostCents]
  )
  if (!row) {
    // Already finalized by a concurrent webhook/reconcile — idempotent no-op.
    const existing = await getVideoGenerationJob(input.id)
    if (!existing) throw new Error(`video generation job ${input.id} not found`)
    return existing
  }
  return mapVideoGenerationJobRow(row)
}

export async function markVideoGenerationJobFailed(id: string, errorMessage: string): Promise<VideoGenerationJob> {
  const row = await queryOne(
    `UPDATE video_generation_jobs
     SET status = 'failed', error_message = $2, completed_at = now(), updated_at = now()
     WHERE id = $1 AND status NOT IN ('succeeded','failed') RETURNING *`,
    [id, errorMessage]
  )
  if (!row) {
    const existing = await getVideoGenerationJob(id)
    if (!existing) throw new Error(`video generation job ${id} not found`)
    return existing
  }
  return mapVideoGenerationJobRow(row)
}

export async function listVideoGenerationJobsForProject(projectId: string, limit = 50): Promise<VideoGenerationJob[]> {
  const rows = await queryRows(
    `SELECT * FROM video_generation_jobs WHERE project_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [projectId, limit]
  )
  return rows.map(mapVideoGenerationJobRow)
}
