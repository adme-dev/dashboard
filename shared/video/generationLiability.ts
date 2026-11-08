import { canonicalMcpJson } from '../utils/mcpRequestClaim'

/**
 * Canonical video-generation liability. Spend is the job row. There is no second ledger.
 *
 * Unresolved states (`reserved`, `uncertain`) keep counting after the calendar month changes.
 * `reported` belongs to the UTC month of `completed_at`, or `created_at` when completion was
 * never recorded. `released` is history and contributes nothing.
 *
 * Pages and the video-generation worker both execute these statements. Do not copy them.
 */

export type VideoGenerationLiabilityState = 'released' | 'reserved' | 'uncertain' | 'reported'

export const VIDEO_GENERATION_LIABILITY_STATES: readonly VideoGenerationLiabilityState[] = [
  'released',
  'reserved',
  'uncertain',
  'reported'
]

export const VIDEO_GENERATION_TENANT_LOCK_SQL
  = `SELECT pg_advisory_xact_lock(hashtextextended('videogen:budget:' || $1::text, 0))`

const LIABILITY_ACCOUNTING_PREDICATE = `
  (
    liability_state IN ('reserved', 'uncertain')
    OR (
      liability_state = 'reported'
      AND date_trunc('month', (COALESCE(completed_at, created_at) AT TIME ZONE 'UTC'))
        = date_trunc('month', (now() AT TIME ZONE 'UTC'))
    )
  )
  -- released rows are historical and are omitted from the sum
`

/** Tenant monthly cap. Unresolved liability is not limited to the current month. */
export const TENANT_VIDEO_GENERATION_LIABILITY_SUM_SQL = `
SELECT COALESCE(SUM(liability_cents), 0) AS total
  FROM video_generation_jobs
 WHERE tenant_id = $1
   AND ${LIABILITY_ACCOUNTING_PREDICATE}`

/** Lifetime project ceiling over canonical jobs; settled spend never resets monthly. */
export const PROJECT_VIDEO_GENERATION_LIABILITY_SUM_SQL = `
SELECT COALESCE(SUM(liability_cents), 0) AS total
  FROM video_generation_jobs
 WHERE project_id = $1
   AND liability_state <> 'released'`

/**
 * Operator-wide form of the same predicate, used by inspectGenerationSpendStatus.
 */
export const GLOBAL_VIDEO_GENERATION_LIABILITY_SUM_SQL = `
SELECT COALESCE(SUM(liability_cents), 0) AS total
  FROM video_generation_jobs
 WHERE ${LIABILITY_ACCOUNTING_PREDICATE}`

export const VIDEO_GENERATION_JOB_INSERT_SQL = `
INSERT INTO video_generation_jobs (
  id, tenant_id, project_id, timeline_id, created_by, status, mode, model_id, provider,
  prompt, source_asset_ids, duration_seconds, aspect_ratio, resolution, subject_type,
  compliance_status, compliance_reasons, estimated_cost_cents, idempotency_key,
  request_fingerprint, liability_state, liability_cents, dispatch_eligible
) VALUES (
  COALESCE($1::uuid, gen_random_uuid()),
  $2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,$14,$15,$16,$17::jsonb,$18,$19,$20,$21,$22,$23
)
ON CONFLICT DO NOTHING
RETURNING *`

export const CLAIM_VIDEO_GENERATION_SUBMISSION_SQL = `
UPDATE video_generation_jobs
   SET status = 'running',
       submission_attempted_at = now(),
       liability_state = 'uncertain',
       liability_cents = COALESCE(liability_cents, estimated_cost_cents),
       updated_at = now()
 WHERE id = $1
   AND status = 'queued'
   AND submission_attempted_at IS NULL
   AND dispatch_eligible = true
RETURNING *`

export const MARK_VIDEO_GENERATION_RUNNING_SQL = `
UPDATE video_generation_jobs
   SET status = 'running',
       provider_request_id = COALESCE($2, provider_request_id),
       provider_status = 'running',
       started_at = COALESCE(started_at, now()),
       liability_state = 'uncertain',
       liability_cents = COALESCE(liability_cents, estimated_cost_cents),
       updated_at = now()
 WHERE id = $1
   AND submission_attempted_at IS NOT NULL
   AND status IN ('queued', 'unknown', 'running')
RETURNING *`

export const MARK_VIDEO_GENERATION_UNKNOWN_SQL = `
UPDATE video_generation_jobs
   SET status = 'unknown',
       error_message = $2,
       provider_request_id = COALESCE($3, provider_request_id),
       liability_state = 'uncertain',
       liability_cents = COALESCE(liability_cents, estimated_cost_cents),
       updated_at = now()
 WHERE id = $1
   AND status IN ('queued', 'running', 'unknown')
RETURNING *`

export const MARK_VIDEO_GENERATION_SUCCEEDED_SQL = `
UPDATE video_generation_jobs
   SET status = 'succeeded',
       provider_status = $2,
       provider_result_url = $3,
       output_asset_id = $4,
       output_r2_key = $5,
       output_sha256 = $7,
       actual_cost_cents = $6,
       liability_state = CASE WHEN $6::integer IS NULL THEN 'uncertain' ELSE 'reported' END,
       liability_cents = CASE
         WHEN $6::integer IS NULL THEN COALESCE(liability_cents, estimated_cost_cents)
         ELSE $6::integer
       END,
       completed_at = now(),
       updated_at = now()
 WHERE id = $1
   AND submission_attempted_at IS NOT NULL
   AND status IN ('queued', 'running', 'unknown')
RETURNING *`

/**
 * `$3` is true only when the provider supplied an explicit non-negative integer cost,
 * including zero. A claimed or running row never takes the release branch.
 * A queued row that is still unclaimed can release. Claimed queued rows are excluded
 * so a stale reaper read cannot fail a submit that has already started.
 */
export const MARK_VIDEO_GENERATION_FAILED_SQL = `
UPDATE video_generation_jobs
   SET status = 'failed',
       error_message = $2,
       actual_cost_cents = CASE WHEN $3::boolean THEN $4::integer ELSE actual_cost_cents END,
       liability_state = CASE
         WHEN $3::boolean THEN 'reported'
         WHEN submission_attempted_at IS NULL
          AND provider_request_id IS NULL
          AND status IN ('queued', 'blocked')
           THEN 'released'
         ELSE 'uncertain'
       END,
       liability_cents = CASE
         WHEN $3::boolean THEN $4::integer
         WHEN submission_attempted_at IS NULL
          AND provider_request_id IS NULL
          AND status IN ('queued', 'blocked')
           THEN 0
         ELSE COALESCE(liability_cents, estimated_cost_cents)
       END,
       completed_at = COALESCE(completed_at, now()),
       updated_at = now()
 WHERE id = $1
   AND status NOT IN ('succeeded', 'failed')
   AND (
     $3::boolean
     OR status IN ('running', 'unknown', 'blocked')
     OR provider_request_id IS NOT NULL
     OR (
       status = 'queued'
       AND submission_attempted_at IS NULL
       AND provider_request_id IS NULL
     )
   )
RETURNING *`

/** Recheck the unclaimed predicate at the write, not only in the cron's earlier scan. */
export const FAIL_UNCLAIMED_VIDEO_GENERATION_DISPATCH_SQL = `
UPDATE video_generation_jobs
   SET status = 'failed', error_message = $2, liability_state = 'released',
       liability_cents = 0, completed_at = now(), updated_at = now()
 WHERE id = $1 AND status = 'queued' AND submission_attempted_at IS NULL
   AND provider_request_id IS NULL AND dispatch_eligible = true
RETURNING *`

export const VIDEO_GENERATION_DISPATCH_TIMEOUT = '10 minutes'
export const VIDEO_GENERATION_RECONCILE_WINDOW = '20 minutes'

export const UNCLAIMED_VIDEO_GENERATION_DISPATCH_SQL = `
SELECT * FROM video_generation_jobs
 WHERE status = 'queued'
   AND submission_attempted_at IS NULL
   AND provider_request_id IS NULL
   AND dispatch_eligible = true
   AND created_at < now() - interval '${VIDEO_GENERATION_DISPATCH_TIMEOUT}'
 ORDER BY created_at ASC
 LIMIT 25`

/** Observation only. These rows stay liable; the cron must not fail or release them. */
export const RETAINED_VIDEO_GENERATION_RUNNING_SQL = `
SELECT id FROM video_generation_jobs
 WHERE status IN ('running', 'unknown')
   AND COALESCE(started_at, created_at) < now() - interval '${VIDEO_GENERATION_RECONCILE_WINDOW}'
 ORDER BY COALESCE(started_at, created_at) ASC
 LIMIT 25`

export const INFLIGHT_VIDEO_GENERATION_POLL_SQL = `
SELECT * FROM video_generation_jobs
 WHERE status IN ('running', 'unknown')
   AND provider = 'aigateway'
   AND provider_request_id IS NOT NULL
 ORDER BY COALESCE(started_at, created_at) ASC
 LIMIT 25`

export function isVideoGenerationLiabilityState(value: unknown): value is VideoGenerationLiabilityState {
  return value === 'released' || value === 'reserved' || value === 'uncertain' || value === 'reported'
}

export function readVideoGenerationSourceAssetIds(value: unknown): string[] {
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

export function readVideoGenerationLiability(
  row: Record<string, unknown>,
  estimatedCostCents: number
): {
  liabilityState: VideoGenerationLiabilityState
  liabilityCents: number
  requestFingerprint: string | null
  submissionAttemptedAt: string | null
  dispatchEligible: boolean
} {
  const liabilityState = isVideoGenerationLiabilityState(row.liability_state) ? row.liability_state : 'reserved'
  const liabilityCents = row.liability_cents == null
    ? (liabilityState === 'released' ? 0 : estimatedCostCents)
    : Number(row.liability_cents)
  return {
    liabilityState,
    liabilityCents,
    requestFingerprint: row.request_fingerprint == null ? null : String(row.request_fingerprint),
    submissionAttemptedAt: row.submission_attempted_at == null ? null : String(row.submission_attempted_at),
    dispatchEligible: row.dispatch_eligible == null ? true : Boolean(row.dispatch_eligible)
  }
}

/** New-job initialization. Migration 506 conservatively treats historical queued rows as uncertain. */
export function initialVideoGenerationLiability(input: {
  status: string
  estimatedCostCents: number
  actualCostCents: number | null
}): { liabilityState: VideoGenerationLiabilityState, liabilityCents: number } {
  if (input.actualCostCents != null) {
    return { liabilityState: 'reported', liabilityCents: input.actualCostCents }
  }
  if (input.status === 'blocked') return { liabilityState: 'released', liabilityCents: 0 }
  if (input.status === 'queued' || input.status === 'running') {
    return { liabilityState: 'reserved', liabilityCents: input.estimatedCostCents }
  }
  return { liabilityState: 'uncertain', liabilityCents: input.estimatedCostCents }
}

export function initialDispatchEligible(status: string, requested: boolean | undefined): boolean {
  if (status === 'blocked') return false
  return requested !== false
}

/** Explicit provider cost, including zero. Null means the provider did not say. */
export function explicitActualCostCents(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) return null
  return value
}

export function liabilityAfterKnownFailure(input: {
  status: string
  submissionAttempted: boolean
  providerRequestId: string | null
  estimatedCostCents: number
  currentLiabilityCents: number | null
  actualCostCents?: number | null
}): { liabilityState: VideoGenerationLiabilityState, liabilityCents: number, explicitActual: number | null } {
  const explicitActual = explicitActualCostCents(input.actualCostCents)
  if (explicitActual != null) {
    return { liabilityState: 'reported', liabilityCents: explicitActual, explicitActual }
  }
  const unclaimed = !input.submissionAttempted && !input.providerRequestId && (input.status === 'queued' || input.status === 'blocked')
  if (unclaimed) return { liabilityState: 'released', liabilityCents: 0, explicitActual: null }
  return {
    liabilityState: 'uncertain',
    liabilityCents: input.currentLiabilityCents ?? input.estimatedCostCents,
    explicitActual: null
  }
}

export function videoGenerationLiabilityCountsInTenantMonth(input: {
  liabilityState: VideoGenerationLiabilityState
  createdAt: Date
  completedAt: Date | null
  now: Date
}): boolean {
  if (input.liabilityState === 'reserved' || input.liabilityState === 'uncertain') return true
  if (input.liabilityState !== 'reported') return false
  const accountedAt = input.completedAt ?? input.createdAt
  return accountedAt.getUTCFullYear() === input.now.getUTCFullYear()
    && accountedAt.getUTCMonth() === input.now.getUTCMonth()
}

const FINGERPRINT_DOMAIN = 'video-generation-request-v1'

export interface VideoGenerationRequestFingerprintSource {
  actorId: string
  projectId: string
  timelineId?: string | null
  mode: string
  modelId: string
  provider: string
  prompt: string
  sourceAssetIds?: readonly string[] | null
  durationSeconds: number
  aspectRatio: string
  resolution?: string | null
  subjectType: string
  dispatchEligible?: boolean | null
}

export function normalizeVideoGenerationRequestFingerprint(source: VideoGenerationRequestFingerprintSource) {
  const sourceAssetIds = readVideoGenerationSourceAssetIds(source.sourceAssetIds)
  return {
    domain: FINGERPRINT_DOMAIN,
    actorId: source.actorId.trim(),
    projectId: source.projectId.trim(),
    timelineId: source.timelineId?.trim() || null,
    mode: source.mode.trim(),
    modelId: source.modelId.trim(),
    provider: source.provider.trim(),
    prompt: source.prompt,
    sourceAssetIds,
    durationSeconds: Number(source.durationSeconds),
    aspectRatio: source.aspectRatio.trim(),
    resolution: source.resolution?.trim() || null,
    subjectType: source.subjectType.trim(),
    dispatchEligible: source.dispatchEligible !== false
  }
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

/** Deterministic request identity shared by Pages and the Worker. Price is not part of the identity. */
export async function videoGenerationRequestFingerprint(source: VideoGenerationRequestFingerprintSource): Promise<string> {
  return sha256Hex(canonicalMcpJson(normalizeVideoGenerationRequestFingerprint(source)))
}

export function fingerprintSourceFromJobInput(input: {
  createdBy: string
  projectId: string
  timelineId?: string | null
  mode: string
  modelId: string
  provider: string
  prompt: string
  sourceAssetIds?: readonly string[] | null
  durationSeconds: number
  aspectRatio: string
  resolution?: string | null
  subjectType: string
  dispatchEligible?: boolean | null
}): VideoGenerationRequestFingerprintSource {
  return {
    actorId: input.createdBy,
    projectId: input.projectId,
    timelineId: input.timelineId ?? null,
    mode: input.mode,
    modelId: input.modelId,
    provider: input.provider,
    prompt: input.prompt,
    sourceAssetIds: input.sourceAssetIds ?? [],
    durationSeconds: input.durationSeconds,
    aspectRatio: input.aspectRatio,
    resolution: input.resolution ?? null,
    subjectType: input.subjectType,
    dispatchEligible: input.dispatchEligible
  }
}

export function fingerprintSourceFromJobRow(row: Record<string, unknown>): VideoGenerationRequestFingerprintSource {
  return fingerprintSourceFromJobInput({
    createdBy: String(row.created_by ?? ''),
    projectId: String(row.project_id ?? ''),
    timelineId: row.timeline_id == null ? null : String(row.timeline_id),
    mode: String(row.mode ?? ''),
    modelId: String(row.model_id ?? ''),
    provider: String(row.provider ?? ''),
    prompt: String(row.prompt ?? ''),
    sourceAssetIds: readVideoGenerationSourceAssetIds(row.source_asset_ids),
    durationSeconds: Number(row.duration_seconds),
    aspectRatio: String(row.aspect_ratio ?? ''),
    resolution: row.resolution == null ? null : String(row.resolution),
    subjectType: String(row.subject_type ?? ''),
    dispatchEligible: row.dispatch_eligible == null ? true : Boolean(row.dispatch_eligible)
  })
}

export interface VideoGenerationJobInsertParamsInput {
  id?: string | null
  tenantId: string
  projectId: string
  timelineId: string | null
  createdBy: string
  status: string
  mode: string
  modelId: string
  provider: string
  prompt: string
  sourceAssetIds: readonly string[]
  durationSeconds: number
  aspectRatio: string
  resolution: string | null
  subjectType: string
  complianceStatus: string
  complianceReasons: readonly string[]
  estimatedCostCents: number
  idempotencyKey: string
  requestFingerprint: string
  liabilityState: VideoGenerationLiabilityState
  liabilityCents: number
  dispatchEligible: boolean
}

export function videoGenerationJobInsertParams(input: VideoGenerationJobInsertParamsInput): unknown[] {
  return [
    input.id ?? null,
    input.tenantId,
    input.projectId,
    input.timelineId,
    input.createdBy,
    input.status,
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
    input.requestFingerprint,
    input.liabilityState,
    input.liabilityCents,
    input.dispatchEligible
  ]
}

export async function comparableVideoGenerationFingerprint(row: Record<string, unknown>): Promise<string> {
  if (typeof row.request_fingerprint === 'string' && row.request_fingerprint.length > 0) return row.request_fingerprint
  return videoGenerationRequestFingerprint(fingerprintSourceFromJobRow(row))
}
