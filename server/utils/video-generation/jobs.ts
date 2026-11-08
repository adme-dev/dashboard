import { queryOne, queryRows } from '~~/server/utils/db'
import {
  CLAIM_VIDEO_GENERATION_SUBMISSION_SQL,
  FAIL_UNCLAIMED_VIDEO_GENERATION_DISPATCH_SQL,
  MARK_VIDEO_GENERATION_FAILED_SQL,
  MARK_VIDEO_GENERATION_RUNNING_SQL,
  MARK_VIDEO_GENERATION_SUCCEEDED_SQL,
  MARK_VIDEO_GENERATION_UNKNOWN_SQL,
  VIDEO_GENERATION_JOB_INSERT_SQL,
  comparableVideoGenerationFingerprint,
  explicitActualCostCents,
  fingerprintSourceFromJobInput,
  initialDispatchEligible,
  initialVideoGenerationLiability,
  readVideoGenerationLiability,
  readVideoGenerationSourceAssetIds,
  videoGenerationJobInsertParams,
  videoGenerationRequestFingerprint,
} from '~~/shared/video/generationLiability'
import {
  stampVideoGenerationTransition,
  type VideoGenerationJob,
  type VideoGenerationJobStatus,
  type VideoGenerationMode,
  type VideoGenerationSubjectType,
} from '~~/server/utils/video-generation/types'

export class VideoGenerationIdempotencyConflictError extends Error {
  readonly reason = 'idempotency_key_conflict' as const
  readonly statusCode = 409
  readonly statusMessage = 'Idempotency key is already used for a different request'

  constructor() {
    super('Idempotency key is already used for a different request')
    this.name = 'VideoGenerationIdempotencyConflictError'
  }
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
    sourceAssetIds: readVideoGenerationSourceAssetIds(row.source_asset_ids),
    durationSeconds: Number(row.duration_seconds),
    aspectRatio: row.aspect_ratio,
    resolution: row.resolution ?? null,
    subjectType: row.subject_type as VideoGenerationSubjectType,
    complianceStatus: row.compliance_status,
    complianceReasons: readVideoGenerationSourceAssetIds(row.compliance_reasons),
    estimatedCostCents: Number(row.estimated_cost_cents),
    actualCostCents: row.actual_cost_cents == null ? null : Number(row.actual_cost_cents),
    ...readVideoGenerationLiability(row, Number(row.estimated_cost_cents)),
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
  /** Pre-reserved id (God mode ledger); minted when omitted. */
  id?: string
  /** False for storyboard reservations that must not be dispatched or reaped. Defaults true. */
  dispatchEligible?: boolean
}

export async function createVideoGenerationJob(input: CreateVideoGenerationJobInput): Promise<VideoGenerationJob> {
  const status = input.status ?? 'queued'
  const dispatchEligible = initialDispatchEligible(status, input.dispatchEligible)
  const fingerprint = await videoGenerationRequestFingerprint(fingerprintSourceFromJobInput({ ...input, dispatchEligible }))
  const liability = initialVideoGenerationLiability({
    status,
    estimatedCostCents: input.estimatedCostCents,
    actualCostCents: null,
  })
  const row = await queryOne(
    VIDEO_GENERATION_JOB_INSERT_SQL,
    videoGenerationJobInsertParams({
      ...input,
      id: input.id ?? null,
      status,
      requestFingerprint: fingerprint,
      liabilityState: liability.liabilityState,
      liabilityCents: liability.liabilityCents,
      dispatchEligible,
    }),
  )
  if (row) return mapVideoGenerationJobRow(row)
  const existing = await getVideoGenerationJobByIdempotencyKey(input.tenantId, input.idempotencyKey)
  if (!existing) throw new Error('video generation job insert failed')
  const comparable = await comparableVideoGenerationFingerprint({
    ...fingerprintSourceToRow(existing),
    request_fingerprint: existing.requestFingerprint,
  })
  if (comparable !== fingerprint) throw new VideoGenerationIdempotencyConflictError()
  return existing
}

function fingerprintSourceToRow(job: VideoGenerationJob): Record<string, unknown> {
  return {
    created_by: job.createdBy,
    project_id: job.projectId,
    timeline_id: job.timelineId,
    mode: job.mode,
    model_id: job.modelId,
    provider: job.provider,
    prompt: job.prompt,
    source_asset_ids: job.sourceAssetIds,
    duration_seconds: job.durationSeconds,
    aspect_ratio: job.aspectRatio,
    resolution: job.resolution,
    subject_type: job.subjectType,
    dispatch_eligible: job.dispatchEligible,
    request_fingerprint: job.requestFingerprint,
  }
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

async function updateJobOrCurrent(sql: string, params: unknown[], id: string): Promise<VideoGenerationJob> {
  const row = await queryOne(sql, params)
  if (row) return stampVideoGenerationTransition(mapVideoGenerationJobRow(row), true)
  const existing = await getVideoGenerationJob(id)
  if (!existing) throw new Error(`video generation job ${id} not found`)
  return stampVideoGenerationTransition(existing, false)
}

/** Compare-and-swap before any provider call. Null means another worker owns the submit. */
export async function claimVideoGenerationSubmission(id: string): Promise<VideoGenerationJob | null> {
  const row = await queryOne(CLAIM_VIDEO_GENERATION_SUBMISSION_SQL, [id])
  return row ? mapVideoGenerationJobRow(row) : null
}

export async function markVideoGenerationJobRunning(id: string, providerRequestId?: string | null): Promise<VideoGenerationJob> {
  return updateJobOrCurrent(MARK_VIDEO_GENERATION_RUNNING_SQL, [id, providerRequestId ?? null], id)
}

/** Ambiguous outcome after a claim. Keeps the estimate and does not invite another submit. */
export async function markVideoGenerationJobUnknown(
  id: string,
  errorMessage: string,
  providerRequestId?: string | null,
): Promise<VideoGenerationJob> {
  return updateJobOrCurrent(MARK_VIDEO_GENERATION_UNKNOWN_SQL, [id, errorMessage, providerRequestId ?? null], id)
}

export async function markVideoGenerationJobSucceeded(input: {
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

export async function markVideoGenerationJobFailed(
  id: string,
  errorMessage: string,
  actualCostCents?: number | null,
): Promise<VideoGenerationJob> {
  const explicit = explicitActualCostCents(actualCostCents)
  return updateJobOrCurrent(MARK_VIDEO_GENERATION_FAILED_SQL, [
    id,
    errorMessage,
    explicit != null,
    explicit,
  ], id)
}

export async function listVideoGenerationJobsForProject(projectId: string, limit = 50): Promise<VideoGenerationJob[]> {
  const rows = await queryRows(
    `SELECT * FROM video_generation_jobs WHERE project_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [projectId, limit]
  )
  return rows.map(mapVideoGenerationJobRow)
}

export async function listVideoGenerationJobsForProjects(projectIds: string[], limit = 50): Promise<VideoGenerationJob[]> {
  if (projectIds.length === 0) return []
  const rows = await queryRows(
    `SELECT * FROM video_generation_jobs
      WHERE project_id = ANY($1::uuid[])
      ORDER BY created_at DESC
      LIMIT $2`,
    [projectIds, limit]
  )
  return rows.map(mapVideoGenerationJobRow)
}

export async function failUnclaimedVideoGenerationDispatch(id: string, errorMessage: string): Promise<VideoGenerationJob> {
  return updateJobOrCurrent(FAIL_UNCLAIMED_VIDEO_GENERATION_DISPATCH_SQL, [id, errorMessage], id)
}
