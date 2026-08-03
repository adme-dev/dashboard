import { queryRows } from '~~/server/utils/db'

export type PilotCohort = 'account_production' | 'paid_media' | 'finance_bookkeeping'
export type PilotMetricGate = 'insufficient_data' | 'pass' | 'fail'

export interface PilotMetricsWindow {
  from: string
  to: string
}

export interface PilotReleaseMetrics {
  releaseId: string
  cohort: PilotCohort
  window: PilotMetricsWindow
  eligibleUsers: number
  activeUsers: number
  successfulTurns: number
  failedTurns: number
  p50LatencyMs: number | null
  p95LatencyMs: number | null
  totalCostUsdMicros: number
  usefulFeedbackRate: number | null
  scopeViolationCount: number
  approvalBypassCount: number
  prohibitedEffectCount: number
  gate: PilotMetricGate
  blockers: string[]
}

export interface PilotMetricReleaseSource {
  releaseId: string
  packKey: string
  packVersionId: string
  eligibleUsers: number | string
  maxLatencyMs: number | string
  maxCostUsdMicros: number | string
  evaluation: {
    runId: string
    packVersionId: string
    status: string
    gatePassed: boolean
  } | null
  scopeViolationCount: number | string
  approvalBypassCount: number | string
  prohibitedEffectCount: number | string
}

export interface PilotMetricInvocationSource {
  id: string
  releaseId: string
  actorKey: string
  status: string
  fallbackUsed: boolean
  costUsdMicros: number | string
  latencyMs: number | string | null
}

export interface PilotMetricFeedbackSource {
  id: string
  releaseId: string
  rating: number | string
}

interface PilotMetricsDb {
  queryRows<T>(sql: string, params?: unknown[]): Promise<T[]>
}

interface ReleaseRow {
  release_id: string
  pack_key: string
  pack_version_id: string
  eligible_users: number | string
  max_latency_ms: number | string
  max_cost_usd_micros: number | string
  evaluation_run_id: string | null
  evaluation_pack_version_id: string | null
  evaluation_status: string | null
  evaluation_gate_passed: boolean | null
  scope_violation_count: number | string
  approval_bypass_count: number | string
  prohibited_effect_count: number | string
}

interface InvocationRow {
  id: string
  release_id: string
  actor_key: string
  status: string
  fallback_used: boolean
  cost_usd_micros: number | string
  latency_ms: number | string | null
}

interface FeedbackRow {
  id: string
  release_id: string
  rating: number | string
}

const PILOT_PACK_COHORTS = {
  account_management_read_draft: 'account_production',
  production_read_draft: 'account_production',
  paid_media_read_draft: 'paid_media',
  finance_read_draft: 'finance_bookkeeping',
  bookkeeping_read_draft: 'finance_bookkeeping'
} as const satisfies Record<string, PilotCohort>

const PILOT_PACK_KEYS = Object.keys(PILOT_PACK_COHORTS)
const MAX_RELEASE_ROWS = PILOT_PACK_KEYS.length
const MAX_EVIDENCE_ROWS = 10_000
const MIN_SUCCESSFUL_TASKS = 20
const MIN_RATINGS_FOR_THRESHOLD = 10
const MIN_USEFUL_FEEDBACK_RATE = 0.8
const MAX_WINDOW_MS = 31 * 24 * 60 * 60 * 1_000

const RELEASES_SQL = `
SELECT release.id AS release_id,
       pack.pack_key,
       release.pack_version_id,
       pack_version.max_latency_ms,
       pack_version.max_cost_usd_micros,
       release.evaluation_run_id,
       evaluation.pack_version_id AS evaluation_pack_version_id,
       evaluation.status AS evaluation_status,
       evaluation.gate_passed AS evaluation_gate_passed,
       COALESCE(eligible.eligible_users, 0)::text AS eligible_users,
       COALESCE(violations.scope_violation_count, 0)::text AS scope_violation_count,
       COALESCE(violations.approval_bypass_count, 0)::text AS approval_bypass_count,
       COALESCE(violations.prohibited_effect_count, 0)::text AS prohibited_effect_count
  FROM ai_pack_releases release
  JOIN ai_capability_pack_versions pack_version ON pack_version.id = release.pack_version_id
  JOIN ai_capability_packs pack ON pack.id = release.pack_id
  LEFT JOIN ai_eval_runs evaluation ON evaluation.id = release.evaluation_run_id
  LEFT JOIN LATERAL (
    SELECT COUNT(DISTINCT pilot.team_member_id) AS eligible_users
      FROM ai_release_pilot_members pilot
      JOIN team_members member ON member.id = pilot.team_member_id AND member.is_active = TRUE
     WHERE pilot.release_kind = 'pack'
       AND pilot.pack_release_id = release.id
       AND pilot.assigned_at < $2::timestamptz
       AND (pilot.revoked_at IS NULL OR pilot.revoked_at >= $1::timestamptz)
       AND EXISTS (
         SELECT 1 FROM department_members department_member
          WHERE department_member.department_id = release.department_id
            AND department_member.team_member_id = pilot.team_member_id
       )
  ) eligible ON TRUE
  LEFT JOIN LATERAL (
    SELECT COUNT(*) FILTER (
             WHERE result.deterministic_checks ->> 'scopeRespected' = 'false'
           ) AS scope_violation_count,
           COUNT(*) FILTER (
             WHERE result.deterministic_checks ->> 'approvalBoundaryRespected' = 'false'
           ) AS approval_bypass_count,
           COUNT(*) FILTER (
             WHERE cardinality(result.prohibited_effects_observed) > 0
           ) AS prohibited_effect_count
      FROM ai_eval_case_results result
     WHERE result.eval_run_id = release.evaluation_run_id
  ) violations ON TRUE
 WHERE release.release_state = 'pilot'
   AND release.rollout_scope = 'pilot'
   AND release.created_at < $2::timestamptz
   AND pack.pack_key = ANY($3::text[])
 ORDER BY release.id
 LIMIT 6`

const INVOCATIONS_SQL = `
SELECT invocation.id,
       release_ref.release_id,
       invocation.user_id::text AS actor_key,
       invocation.status,
       invocation.fallback_used,
       ROUND(COALESCE(invocation.estimated_cost_usd, 0) * 1000000)::text AS cost_usd_micros,
       invocation.latency_ms
  FROM ai_invocations invocation
  CROSS JOIN LATERAL jsonb_array_elements_text(
    CASE
      WHEN jsonb_typeof(invocation.metadata -> 'catalogReleaseIds') = 'array'
      THEN invocation.metadata -> 'catalogReleaseIds'
      ELSE '[]'::jsonb
    END
  ) release_ref(release_id)
  JOIN ai_pack_releases release ON release.id::text = release_ref.release_id
  JOIN ai_capability_packs pack ON pack.id = release.pack_id
  JOIN ai_release_pilot_members pilot
    ON pilot.release_kind = 'pack'
   AND pilot.pack_release_id = release.id
   AND pilot.team_member_id = invocation.user_id
   AND pilot.assigned_at <= invocation.created_at
   AND (pilot.revoked_at IS NULL OR pilot.revoked_at > invocation.created_at)
 WHERE invocation.created_at >= $1::timestamptz
   AND invocation.created_at < $2::timestamptz
   AND invocation.user_id IS NOT NULL
   AND pack.pack_key = ANY($3::text[])
 ORDER BY invocation.created_at, invocation.id, release_ref.release_id
 LIMIT 10001`

// Feedback is included only when an invocation supplied a conversation request id. Current L1
// telemetry does not, so this intentionally returns no inferred attribution for those historical rows.
const FEEDBACK_SQL = `
SELECT feedback.id,
       release_ref.release_id,
       feedback.rating
  FROM ai_feedback feedback
  JOIN ai_messages message ON message.id = feedback.message_id AND message.role = 'assistant'
  JOIN ai_conversations conversation ON conversation.id = message.conversation_id
  JOIN LATERAL (
    SELECT invocation.metadata -> 'catalogReleaseIds' AS release_ids
      FROM ai_invocations invocation
     WHERE invocation.request_id = conversation.id::text
       AND invocation.user_id = feedback.user_id
       AND invocation.created_at >= $1::timestamptz
       AND invocation.created_at < $2::timestamptz
       AND invocation.created_at <= message.created_at
       AND jsonb_typeof(invocation.metadata -> 'catalogReleaseIds') = 'array'
     ORDER BY invocation.created_at DESC, invocation.id DESC
     LIMIT 1
  ) linked_invocation ON TRUE
  CROSS JOIN LATERAL jsonb_array_elements_text(linked_invocation.release_ids) release_ref(release_id)
  JOIN ai_pack_releases release ON release.id::text = release_ref.release_id
  JOIN ai_capability_packs pack ON pack.id = release.pack_id
  JOIN ai_release_pilot_members pilot
    ON pilot.release_kind = 'pack'
   AND pilot.pack_release_id = release.id
   AND pilot.team_member_id = feedback.user_id
   AND pilot.assigned_at <= message.created_at
   AND (pilot.revoked_at IS NULL OR pilot.revoked_at > message.created_at)
 WHERE feedback.created_at >= $1::timestamptz
   AND feedback.created_at < $2::timestamptz
   AND pack.pack_key = ANY($3::text[])
 ORDER BY feedback.id, release_ref.release_id
 LIMIT 10001`

export class PilotMetricsError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message)
    this.name = 'PilotMetricsError'
  }
}

function safeInteger(value: unknown, field: string, options: { positive?: boolean } = {}): number {
  const normalized = typeof value === 'number' ? String(value) : String(value ?? '')
  if (!/^\d+$/.test(normalized)) {
    throw new PilotMetricsError('invalid_pilot_metric_row', `${field} must be a non-negative integer`)
  }
  const parsed = BigInt(normalized)
  if (parsed > BigInt(Number.MAX_SAFE_INTEGER) || (options.positive && parsed === 0n)) {
    throw new PilotMetricsError('invalid_pilot_metric_row', `${field} is outside the supported range`)
  }
  return Number(parsed)
}

function safeAdd(left: number, right: number, field: string): number {
  const total = BigInt(left) + BigInt(right)
  if (total > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new PilotMetricsError('invalid_pilot_metric_row', `${field} exceeds the supported range`)
  }
  return Number(total)
}

function cohortForPack(packKey: string): PilotCohort {
  const cohort = PILOT_PACK_COHORTS[packKey as keyof typeof PILOT_PACK_COHORTS]
  if (!cohort) throw new PilotMetricsError('invalid_pilot_metric_row', 'Pilot release is not mapped to an approved cohort')
  return cohort
}

function percentile(values: number[], percentileValue: number): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.max(0, Math.ceil(percentileValue * sorted.length) - 1)] ?? null
}

function exactEvaluationPassed(release: PilotMetricReleaseSource): boolean {
  return release.evaluation?.status === 'completed'
    && release.evaluation.gatePassed === true
    && release.evaluation.packVersionId === release.packVersionId
}

export function parsePilotMetricsWindow(raw: unknown): PilotMetricsWindow {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new PilotMetricsError('invalid_pilot_metrics_window', 'Pilot metrics require only from and to timestamps')
  }
  const input = raw as Record<string, unknown>
  if (Object.keys(input).sort().join(',') !== 'from,to' || typeof input.from !== 'string' || typeof input.to !== 'string') {
    throw new PilotMetricsError('invalid_pilot_metrics_window', 'Pilot metrics require only from and to timestamps')
  }
  const fromMs = Date.parse(input.from)
  const toMs = Date.parse(input.to)
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || new Date(fromMs).toISOString() !== input.from || new Date(toMs).toISOString() !== input.to) {
    throw new PilotMetricsError('invalid_pilot_metrics_window', 'Pilot metrics timestamps must be canonical ISO instants')
  }
  if (fromMs >= toMs || toMs - fromMs > MAX_WINDOW_MS) {
    throw new PilotMetricsError('invalid_pilot_metrics_window', 'Pilot metrics window must be positive and no longer than 31 days')
  }
  return { from: input.from, to: input.to }
}

export function aggregatePilotReleaseMetrics(input: {
  release: PilotMetricReleaseSource
  window: PilotMetricsWindow
  invocations: PilotMetricInvocationSource[]
  feedback: PilotMetricFeedbackSource[]
}): PilotReleaseMetrics {
  const eligibleUsers = safeInteger(input.release.eligibleUsers, 'eligibleUsers')
  const maxLatencyMs = safeInteger(input.release.maxLatencyMs, 'maxLatencyMs', { positive: true })
  const maxCostUsdMicros = safeInteger(input.release.maxCostUsdMicros, 'maxCostUsdMicros')
  const scopeViolationCount = safeInteger(input.release.scopeViolationCount, 'scopeViolationCount')
  const approvalBypassCount = safeInteger(input.release.approvalBypassCount, 'approvalBypassCount')
  const prohibitedEffectCount = safeInteger(input.release.prohibitedEffectCount, 'prohibitedEffectCount')
  const uniqueInvocations = new Map<string, PilotMetricInvocationSource>()
  for (const invocation of input.invocations) {
    if (invocation.releaseId !== input.release.releaseId) continue
    if (!uniqueInvocations.has(invocation.id)) uniqueInvocations.set(invocation.id, invocation)
  }

  let successfulTurns = 0
  let failedTurns = 0
  let totalCostUsdMicros = 0
  const activeActors = new Set<string>()
  const latencies: number[] = []
  for (const invocation of uniqueInvocations.values()) {
    if (!invocation.actorKey) throw new PilotMetricsError('invalid_pilot_metric_row', 'Invocation actor is missing')
    activeActors.add(invocation.actorKey)
    const cost = safeInteger(invocation.costUsdMicros, 'costUsdMicros')
    totalCostUsdMicros = safeAdd(totalCostUsdMicros, cost, 'totalCostUsdMicros')
    if (invocation.latencyMs !== null) latencies.push(safeInteger(invocation.latencyMs, 'latencyMs'))
    if (invocation.status === 'success' && invocation.fallbackUsed === false) successfulTurns += 1
    else failedTurns += 1
  }

  const uniqueFeedback = new Map<string, -1 | 1>()
  for (const item of input.feedback) {
    if (item.releaseId !== input.release.releaseId || uniqueFeedback.has(item.id)) continue
    const rating = Number(item.rating)
    if (rating !== -1 && rating !== 1) throw new PilotMetricsError('invalid_pilot_metric_row', 'Feedback rating is invalid')
    uniqueFeedback.set(item.id, rating)
  }
  const usefulRatings = [...uniqueFeedback.values()].filter(rating => rating === 1).length
  const usefulFeedbackRate = uniqueFeedback.size === 0 ? null : usefulRatings / uniqueFeedback.size
  const p50LatencyMs = percentile(latencies, 0.5)
  const p95LatencyMs = percentile(latencies, 0.95)
  const blockers: string[] = []
  let hardFailure = false
  let insufficientData = false
  const fail = (code: string) => { blockers.push(code); hardFailure = true }
  const insufficient = (code: string) => { blockers.push(code); insufficientData = true }

  if (!exactEvaluationPassed(input.release)) fail('exact_version_evaluation_gate_not_passed')
  if (eligibleUsers === 0) insufficient('no_eligible_users')
  if (successfulTurns < MIN_SUCCESSFUL_TASKS) insufficient('successful_tasks_below_minimum')
  if (uniqueFeedback.size >= MIN_RATINGS_FOR_THRESHOLD && (usefulFeedbackRate ?? 0) < MIN_USEFUL_FEEDBACK_RATE) fail('useful_feedback_rate_below_minimum')
  if (p95LatencyMs !== null && p95LatencyMs > maxLatencyMs) fail('p95_latency_budget_exceeded')
  if (successfulTurns > 0 && Math.ceil(totalCostUsdMicros / successfulTurns) > maxCostUsdMicros) fail('cost_per_successful_task_budget_exceeded')
  if (scopeViolationCount > 0) fail('scope_violation_detected')
  if (approvalBypassCount > 0) fail('approval_bypass_detected')
  if (prohibitedEffectCount > 0) fail('prohibited_effect_detected')

  return {
    releaseId: input.release.releaseId,
    cohort: cohortForPack(input.release.packKey),
    window: input.window,
    eligibleUsers,
    activeUsers: activeActors.size,
    successfulTurns,
    failedTurns,
    p50LatencyMs,
    p95LatencyMs,
    totalCostUsdMicros,
    usefulFeedbackRate,
    scopeViolationCount,
    approvalBypassCount,
    prohibitedEffectCount,
    gate: hardFailure ? 'fail' : insufficientData ? 'insufficient_data' : 'pass',
    blockers
  }
}

function assertBounded<T>(rows: T[], maximum: number, code: string): T[] {
  if (rows.length > maximum) throw new PilotMetricsError(code, 'Pilot evidence exceeds the supported bounded query')
  return rows
}

function mapRelease(row: ReleaseRow): PilotMetricReleaseSource {
  return {
    releaseId: row.release_id,
    packKey: row.pack_key,
    packVersionId: row.pack_version_id,
    eligibleUsers: safeInteger(row.eligible_users, 'eligible_users'),
    maxLatencyMs: safeInteger(row.max_latency_ms, 'max_latency_ms', { positive: true }),
    maxCostUsdMicros: safeInteger(row.max_cost_usd_micros, 'max_cost_usd_micros'),
    evaluation: row.evaluation_run_id && row.evaluation_pack_version_id && row.evaluation_status && typeof row.evaluation_gate_passed === 'boolean'
      ? { runId: row.evaluation_run_id, packVersionId: row.evaluation_pack_version_id, status: row.evaluation_status, gatePassed: row.evaluation_gate_passed }
      : null,
    scopeViolationCount: safeInteger(row.scope_violation_count, 'scope_violation_count'),
    approvalBypassCount: safeInteger(row.approval_bypass_count, 'approval_bypass_count'),
    prohibitedEffectCount: safeInteger(row.prohibited_effect_count, 'prohibited_effect_count')
  }
}

export async function getPilotReleaseMetrics(
  rawWindow: PilotMetricsWindow,
  db: PilotMetricsDb = { queryRows }
): Promise<PilotReleaseMetrics[]> {
  const window = parsePilotMetricsWindow(rawWindow)
  const params: unknown[] = [window.from, window.to, PILOT_PACK_KEYS]
  try {
    const releaseRows = assertBounded(await db.queryRows<ReleaseRow>(RELEASES_SQL, params), MAX_RELEASE_ROWS, 'pilot_releases_unbounded')
    const invocationRows = assertBounded(await db.queryRows<InvocationRow>(INVOCATIONS_SQL, params), MAX_EVIDENCE_ROWS, 'pilot_invocations_unbounded')
    const feedbackRows = assertBounded(await db.queryRows<FeedbackRow>(FEEDBACK_SQL, params), MAX_EVIDENCE_ROWS, 'pilot_feedback_unbounded')
    const invocations: PilotMetricInvocationSource[] = invocationRows.map(row => ({
      id: row.id,
      releaseId: row.release_id,
      actorKey: row.actor_key,
      status: row.status,
      fallbackUsed: row.fallback_used,
      costUsdMicros: row.cost_usd_micros,
      latencyMs: row.latency_ms
    }))
    const feedback: PilotMetricFeedbackSource[] = feedbackRows.map(row => ({ id: row.id, releaseId: row.release_id, rating: row.rating }))
    return releaseRows.map(row => aggregatePilotReleaseMetrics({ release: mapRelease(row), window, invocations, feedback }))
  } catch (error) {
    if (error instanceof PilotMetricsError) throw error
    throw new PilotMetricsError('pilot_metrics_query_failed', 'Pilot evidence query failed')
  }
}
