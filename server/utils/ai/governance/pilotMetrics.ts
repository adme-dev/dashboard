import { queryRows } from '~~/server/utils/db'

export type PilotCohort = 'account_production' | 'paid_media' | 'finance_bookkeeping'
export type PilotMetricGate = 'insufficient_data' | 'pass' | 'fail'

export interface PilotMetricsWindow { from: string, to: string }

export interface PilotReleaseMetrics {
  releaseId: string | null
  packKey: string
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
  ratingCount: number
  scopeViolationCount: number
  approvalBypassCount: number
  prohibitedEffectCount: number
  gate: PilotMetricGate
  blockers: string[]
}

export interface PilotMetricsSummary {
  gate: PilotMetricGate
  blockers: string[]
  requiredPackCount: number
  presentReleaseCount: number
}

export interface PilotMetricsReport { metrics: PilotReleaseMetrics[], summary: PilotMetricsSummary }

export interface PilotMetricReleaseSource {
  releaseId: string
  packKey: string
  packVersionId: string
  eligibleUsers: number | string
  maxLatencyMs: number | string
  maxCostUsdMicros: number | string
  pilotEpisodeStartedAt?: string | null
  evaluation: { runId: string, packVersionId: string, status: string, gatePassed: boolean } | null
  // Retained for compatibility with repository rows. Gate safety comes only from live observations.
  scopeViolationCount: number | string
  approvalBypassCount: number | string
  prohibitedEffectCount: number | string
}

export interface PilotMetricInvocationSource {
  id: string
  attemptId: string | null
  turnId: string | null
  releaseId: string
  packVersionId: string | null
  representativeTaskId: string | null
  assistantMessageId: string | null
  actorKey: string
  status: string
  fallbackUsed: boolean
  terminal?: boolean
  costUsdMicros: number | string | null
  latencyMs: number | string | null
  scopeRespected: boolean | null
  approvalBoundaryRespected: boolean | null
  prohibitedEffectsCount: number | string | null
  createdAt?: string | null
}

export interface PilotMetricFeedbackSource {
  id: string
  releaseId: string
  rating: number | string
  turnId?: string | null
  assistantMessageId?: string | null
}

interface PilotMetricsDb { queryRows<T>(sql: string, params?: unknown[]): Promise<T[]> }

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
  pilot_episode_started_at: string | null
}

interface InvocationRow {
  id: string
  attempt_id: string | null
  turn_id: string | null
  release_id: string
  pack_version_id: string | null
  representative_task_id: string | null
  assistant_message_id: string | null
  actor_key: string
  status: string
  fallback_used: boolean
  terminal: boolean | null
  cost_usd_micros: number | string | null
  latency_ms: number | string | null
  scope_respected: boolean | null
  approval_boundary_respected: boolean | null
  prohibited_effects_count: number | string | null
  created_at: string
}

interface FeedbackRow {
  id: string
  release_id: string
  turn_id: string | null
  assistant_message_id: string | null
  rating: number | string
}

export const PILOT_PACK_COHORTS = {
  account_management_read_draft: 'account_production',
  production_read_draft: 'account_production',
  paid_media_read_draft: 'paid_media',
  finance_read_draft: 'finance_bookkeeping',
  bookkeeping_read_draft: 'finance_bookkeeping'
} as const satisfies Record<string, PilotCohort>

const PILOT_PACK_KEYS = Object.keys(PILOT_PACK_COHORTS)
const MAX_RELEASE_ROWS = PILOT_PACK_KEYS.length + 1
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
       pilot_episode.created_at AS pilot_episode_started_at,
       COALESCE(eligible.eligible_users, 0)::text AS eligible_users
  FROM ai_pack_releases release
  JOIN ai_capability_pack_versions pack_version ON pack_version.id = release.pack_version_id
  JOIN ai_capability_packs pack ON pack.id = release.pack_id
  LEFT JOIN ai_eval_runs evaluation ON evaluation.id = release.evaluation_run_id
  LEFT JOIN LATERAL (
    SELECT audit.created_at
      FROM ai_catalog_audit_events audit
     WHERE audit.entity_type = 'pack'
       AND audit.entity_id = pack.id
       AND audit.action = 'pilot'
       AND audit.next_version_id = release.pack_version_id
     ORDER BY audit.created_at DESC, audit.id DESC
     LIMIT 1
  ) pilot_episode ON TRUE
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
 WHERE release.release_state = 'pilot'
   AND release.rollout_scope = 'pilot'
   AND release.created_at < $2::timestamptz
   AND pack.pack_key = ANY($3::text[])
 ORDER BY pack.pack_key, release.id
 LIMIT 7`

const INVOCATIONS_SQL = `
SELECT invocation.id,
       invocation.metadata ->> 'attemptId' AS attempt_id,
       invocation.metadata ->> 'turnId' AS turn_id,
       invocation.metadata -> 'pilotEvidence' ->> 'releaseId' AS release_id,
       invocation.metadata -> 'pilotEvidence' ->> 'packVersionId' AS pack_version_id,
       invocation.metadata -> 'pilotEvidence' ->> 'representativeTaskId' AS representative_task_id,
       invocation.metadata ->> 'assistantMessageId' AS assistant_message_id,
       invocation.user_id::text AS actor_key,
       invocation.status,
       invocation.fallback_used,
       (invocation.metadata ->> 'terminal')::boolean AS terminal,
       CASE WHEN invocation.estimated_cost_usd IS NULL THEN NULL
            ELSE ROUND(invocation.estimated_cost_usd * 1000000)::text END AS cost_usd_micros,
       invocation.latency_ms,
       (invocation.metadata -> 'liveSafety' ->> 'scopeRespected')::boolean AS scope_respected,
       (invocation.metadata -> 'liveSafety' ->> 'approvalBoundaryRespected')::boolean AS approval_boundary_respected,
       invocation.metadata -> 'liveSafety' ->> 'prohibitedEffectsCount' AS prohibited_effects_count,
       invocation.created_at
  FROM ai_invocations invocation
  JOIN ai_pack_releases release
    ON release.id::text = invocation.metadata -> 'pilotEvidence' ->> 'releaseId'
   AND release.pack_version_id::text = invocation.metadata -> 'pilotEvidence' ->> 'packVersionId'
   AND release.release_state = 'pilot'
   AND release.rollout_scope = 'pilot'
  JOIN ai_capability_packs pack ON pack.id = release.pack_id
  JOIN LATERAL (
    SELECT audit.created_at
      FROM ai_catalog_audit_events audit
     WHERE audit.entity_type = 'pack'
       AND audit.entity_id = pack.id
       AND audit.action = 'pilot'
       AND audit.next_version_id = release.pack_version_id
     ORDER BY audit.created_at DESC, audit.id DESC
     LIMIT 1
  ) pilot_episode ON invocation.created_at >= pilot_episode.created_at
  JOIN ai_release_pilot_members pilot
    ON pilot.release_kind = 'pack'
   AND pilot.pack_release_id = release.id
   AND pilot.team_member_id = invocation.user_id
   AND pilot.assigned_at <= invocation.created_at
   AND (pilot.revoked_at IS NULL OR pilot.revoked_at > invocation.created_at)
 WHERE invocation.created_at >= $1::timestamptz
   AND invocation.created_at < $2::timestamptz
   AND invocation.user_id IS NOT NULL
   AND invocation.metadata ? 'turnId'
   AND invocation.metadata ? 'attemptId'
   AND invocation.metadata ? 'assistantMessageId'
   AND invocation.metadata -> 'pilotEvidence' ? 'representativeTaskId'
   AND pack.pack_key = ANY($3::text[])
 ORDER BY invocation.created_at, invocation.id
 LIMIT 10001`

const FEEDBACK_SQL = `
SELECT DISTINCT feedback.id,
       invocation.metadata -> 'pilotEvidence' ->> 'releaseId' AS release_id,
       invocation.metadata ->> 'turnId' AS turn_id,
       invocation.metadata ->> 'assistantMessageId' AS assistant_message_id,
       feedback.rating
  FROM ai_feedback feedback
  JOIN ai_messages message ON message.id = feedback.message_id AND message.role = 'assistant'
  JOIN ai_invocations invocation
    ON invocation.metadata ->> 'assistantMessageId' = feedback.message_id::text
   AND invocation.user_id = feedback.user_id
   AND invocation.metadata ->> 'terminal' = 'true'
  JOIN ai_pack_releases release
    ON release.id::text = invocation.metadata -> 'pilotEvidence' ->> 'releaseId'
   AND release.pack_version_id::text = invocation.metadata -> 'pilotEvidence' ->> 'packVersionId'
   AND release.release_state = 'pilot'
   AND release.rollout_scope = 'pilot'
  JOIN ai_capability_packs pack ON pack.id = release.pack_id
  JOIN LATERAL (
    SELECT audit.created_at
      FROM ai_catalog_audit_events audit
     WHERE audit.entity_type = 'pack'
       AND audit.entity_id = pack.id
       AND audit.action = 'pilot'
       AND audit.next_version_id = release.pack_version_id
     ORDER BY audit.created_at DESC, audit.id DESC
     LIMIT 1
  ) pilot_episode ON feedback.created_at >= pilot_episode.created_at
 WHERE feedback.created_at >= $1::timestamptz
   AND feedback.created_at < $2::timestamptz
   AND pack.pack_key = ANY($3::text[])
 ORDER BY feedback.id, release_id
 LIMIT 10001`

export class PilotMetricsError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message)
    this.name = 'PilotMetricsError'
  }
}

function safeInteger(value: unknown, field: string, options: { positive?: boolean } = {}): number {
  const normalized = typeof value === 'number' ? String(value) : String(value ?? '')
  if (!/^\d+$/.test(normalized)) throw new PilotMetricsError('invalid_pilot_metric_row', `${field} must be a non-negative integer`)
  const parsed = BigInt(normalized)
  if (parsed > BigInt(Number.MAX_SAFE_INTEGER) || (options.positive && parsed === 0n)) {
    throw new PilotMetricsError('invalid_pilot_metric_row', `${field} is outside the supported range`)
  }
  return Number(parsed)
}

function safeAdd(left: number, right: number, field: string): number {
  const total = BigInt(left) + BigInt(right)
  if (total > BigInt(Number.MAX_SAFE_INTEGER)) throw new PilotMetricsError('invalid_pilot_metric_row', `${field} exceeds the supported range`)
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
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new PilotMetricsError('invalid_pilot_metrics_window', 'Pilot metrics require only from and to timestamps')
  const input = raw as Record<string, unknown>
  if (Object.keys(input).sort().join(',') !== 'from,to' || typeof input.from !== 'string' || typeof input.to !== 'string') {
    throw new PilotMetricsError('invalid_pilot_metrics_window', 'Pilot metrics require only from and to timestamps')
  }
  const fromMs = Date.parse(input.from)
  const toMs = Date.parse(input.to)
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || new Date(fromMs).toISOString() !== input.from || new Date(toMs).toISOString() !== input.to) {
    throw new PilotMetricsError('invalid_pilot_metrics_window', 'Pilot metrics timestamps must be canonical ISO instants')
  }
  if (fromMs >= toMs || toMs - fromMs > MAX_WINDOW_MS) throw new PilotMetricsError('invalid_pilot_metrics_window', 'Pilot metrics window must be positive and no longer than 31 days')
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
  const episodeMs = input.release.pilotEpisodeStartedAt ? Date.parse(input.release.pilotEpisodeStartedAt) : Number.NaN
  const attempts = new Map<string, PilotMetricInvocationSource>()
  for (const invocation of input.invocations) {
    const representative = invocation.releaseId === input.release.releaseId
      && invocation.packVersionId === input.release.packVersionId
      && Boolean(invocation.turnId && invocation.attemptId && invocation.representativeTaskId && invocation.assistantMessageId)
      && (!invocation.createdAt || !Number.isFinite(episodeMs) || Date.parse(invocation.createdAt) >= episodeMs)
    if (!representative) continue
    if (!attempts.has(invocation.attemptId!)) attempts.set(invocation.attemptId!, invocation)
  }

  const turns = new Map<string, PilotMetricInvocationSource[]>()
  let totalCostUsdMicros = 0
  let incompleteCost = false
  let incompleteLatency = false
  const activeActors = new Set<string>()
  for (const attempt of attempts.values()) {
    if (!attempt.actorKey) throw new PilotMetricsError('invalid_pilot_metric_row', 'Invocation actor is missing')
    activeActors.add(attempt.actorKey)
    const turnAttempts = turns.get(attempt.turnId!) ?? []
    turnAttempts.push(attempt)
    turns.set(attempt.turnId!, turnAttempts)
    if (attempt.costUsdMicros === null) incompleteCost = true
    else totalCostUsdMicros = safeAdd(totalCostUsdMicros, safeInteger(attempt.costUsdMicros, 'costUsdMicros'), 'totalCostUsdMicros')
    if (attempt.latencyMs === null) incompleteLatency = true
  }

  let successfulTurns = 0
  let failedTurns = 0
  let scopeViolationCount = 0
  let approvalBypassCount = 0
  let prohibitedEffectCount = 0
  let missingLiveSafety = false
  const turnLatencies: number[] = []
  for (const turnAttempts of turns.values()) {
    const terminal = [...turnAttempts].reverse().find(attempt => attempt.terminal !== false)
    if (!terminal) {
      failedTurns += 1
      missingLiveSafety = true
      continue
    }
    if (terminal.status === 'success' && terminal.fallbackUsed === false) successfulTurns += 1
    else failedTurns += 1
    if (turnAttempts.every(attempt => attempt.latencyMs !== null)) {
      turnLatencies.push(turnAttempts.reduce((total, attempt) => safeAdd(total, safeInteger(attempt.latencyMs, 'latencyMs'), 'turnLatencyMs'), 0))
    }
    if (terminal.scopeRespected === null || terminal.approvalBoundaryRespected === null || terminal.prohibitedEffectsCount === null) {
      missingLiveSafety = true
    } else {
      if (!terminal.scopeRespected) scopeViolationCount += 1
      if (!terminal.approvalBoundaryRespected) approvalBypassCount += 1
      prohibitedEffectCount = safeAdd(prohibitedEffectCount, safeInteger(terminal.prohibitedEffectsCount, 'prohibitedEffectsCount'), 'prohibitedEffectCount')
    }
  }

  const uniqueFeedback = new Map<string, -1 | 1>()
  for (const item of input.feedback) {
    if (item.releaseId !== input.release.releaseId || uniqueFeedback.has(item.id)) continue
    const rating = Number(item.rating)
    if (rating !== -1 && rating !== 1) throw new PilotMetricsError('invalid_pilot_metric_row', 'Feedback rating is invalid')
    uniqueFeedback.set(item.id, rating)
  }
  const ratingCount = uniqueFeedback.size
  const usefulRatings = [...uniqueFeedback.values()].filter(rating => rating === 1).length
  const usefulFeedbackRate = ratingCount === 0 ? null : usefulRatings / ratingCount
  const p50LatencyMs = percentile(turnLatencies, 0.5)
  const p95LatencyMs = percentile(turnLatencies, 0.95)
  const blockers: string[] = []
  let hardFailure = false
  let insufficientData = false
  const fail = (code: string) => { blockers.push(code); hardFailure = true }
  const insufficient = (code: string) => { blockers.push(code); insufficientData = true }

  if (!exactEvaluationPassed(input.release)) fail('exact_version_evaluation_gate_not_passed')
  if (!Number.isFinite(episodeMs)) insufficient('pilot_episode_audit_missing')
  if (eligibleUsers === 0) insufficient('no_eligible_users')
  if (turns.size === 0) insufficient('representative_task_telemetry_missing')
  if (incompleteCost) insufficient('incomplete_cost_measurement')
  if (incompleteLatency) insufficient('incomplete_latency_measurement')
  if (missingLiveSafety) insufficient('live_safety_observation_missing')
  if (successfulTurns < MIN_SUCCESSFUL_TASKS) insufficient('successful_tasks_below_minimum')
  if (ratingCount >= MIN_RATINGS_FOR_THRESHOLD && (usefulFeedbackRate ?? 0) < MIN_USEFUL_FEEDBACK_RATE) fail('useful_feedback_rate_below_minimum')
  if (p95LatencyMs !== null && p95LatencyMs > maxLatencyMs) fail('p95_latency_budget_exceeded')
  if (!incompleteCost && successfulTurns > 0 && Math.ceil(totalCostUsdMicros / successfulTurns) > maxCostUsdMicros) fail('cost_per_successful_task_budget_exceeded')
  if (scopeViolationCount > 0) fail('scope_violation_detected')
  if (approvalBypassCount > 0) fail('approval_bypass_detected')
  if (prohibitedEffectCount > 0) fail('prohibited_effect_detected')

  return {
    releaseId: input.release.releaseId,
    packKey: input.release.packKey,
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
    ratingCount,
    scopeViolationCount,
    approvalBypassCount,
    prohibitedEffectCount,
    gate: hardFailure ? 'fail' : insufficientData ? 'insufficient_data' : 'pass',
    blockers
  }
}

function missingMetric(packKey: string, window: PilotMetricsWindow, gate: PilotMetricGate, blockers: string[]): PilotReleaseMetrics {
  return {
    releaseId: null, packKey, cohort: cohortForPack(packKey), window,
    eligibleUsers: 0, activeUsers: 0, successfulTurns: 0, failedTurns: 0,
    p50LatencyMs: null, p95LatencyMs: null, totalCostUsdMicros: 0,
    usefulFeedbackRate: null, ratingCount: 0, scopeViolationCount: 0,
    approvalBypassCount: 0, prohibitedEffectCount: 0, gate, blockers
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
    pilotEpisodeStartedAt: row.pilot_episode_started_at,
    evaluation: row.evaluation_run_id && row.evaluation_pack_version_id && row.evaluation_status && typeof row.evaluation_gate_passed === 'boolean'
      ? { runId: row.evaluation_run_id, packVersionId: row.evaluation_pack_version_id, status: row.evaluation_status, gatePassed: row.evaluation_gate_passed }
      : null,
    scopeViolationCount: 0,
    approvalBypassCount: 0,
    prohibitedEffectCount: 0
  }
}

function overallSummary(metrics: PilotReleaseMetrics[], presentReleaseCount: number, structuralBlockers: string[]): PilotMetricsSummary {
  const blockers = [...structuralBlockers]
  for (const cohort of ['account_production', 'paid_media', 'finance_bookkeeping'] as const) {
    const successes = metrics.filter(metric => metric.cohort === cohort).reduce((sum, metric) => sum + metric.successfulTurns, 0)
    if (successes < MIN_SUCCESSFUL_TASKS) blockers.push(`cohort_successful_tasks_below_minimum:${cohort}`)
  }
  const hardFailure = structuralBlockers.some(blocker => blocker.startsWith('duplicate_pilot_release:'))
    || metrics.some(metric => metric.gate === 'fail')
  const insufficient = blockers.length > 0 || metrics.some(metric => metric.gate === 'insufficient_data')
  return {
    gate: hardFailure ? 'fail' : insufficient ? 'insufficient_data' : 'pass',
    blockers,
    requiredPackCount: PILOT_PACK_KEYS.length,
    presentReleaseCount
  }
}

export async function getPilotReleaseMetrics(
  rawWindow: PilotMetricsWindow,
  db: PilotMetricsDb = { queryRows }
): Promise<PilotMetricsReport> {
  const window = parsePilotMetricsWindow(rawWindow)
  const params: unknown[] = [window.from, window.to, PILOT_PACK_KEYS]
  try {
    const releaseRows = assertBounded(await db.queryRows<ReleaseRow>(RELEASES_SQL, params), MAX_RELEASE_ROWS, 'pilot_releases_unbounded')
    const invocationRows = assertBounded(await db.queryRows<InvocationRow>(INVOCATIONS_SQL, params), MAX_EVIDENCE_ROWS, 'pilot_invocations_unbounded')
    const feedbackRows = assertBounded(await db.queryRows<FeedbackRow>(FEEDBACK_SQL, params), MAX_EVIDENCE_ROWS, 'pilot_feedback_unbounded')
    const invocations: PilotMetricInvocationSource[] = invocationRows.map(row => ({
      id: row.id, attemptId: row.attempt_id, turnId: row.turn_id, releaseId: row.release_id,
      packVersionId: row.pack_version_id, representativeTaskId: row.representative_task_id,
      assistantMessageId: row.assistant_message_id, actorKey: row.actor_key, status: row.status,
      fallbackUsed: row.fallback_used, terminal: row.terminal === true, costUsdMicros: row.cost_usd_micros,
      latencyMs: row.latency_ms, scopeRespected: row.scope_respected,
      approvalBoundaryRespected: row.approval_boundary_respected,
      prohibitedEffectsCount: row.prohibited_effects_count, createdAt: row.created_at
    }))
    const feedback: PilotMetricFeedbackSource[] = feedbackRows.map(row => ({
      id: row.id, releaseId: row.release_id, turnId: row.turn_id,
      assistantMessageId: row.assistant_message_id, rating: row.rating
    }))
    const grouped = new Map<string, ReleaseRow[]>()
    for (const row of releaseRows) grouped.set(row.pack_key, [...(grouped.get(row.pack_key) ?? []), row])
    const structuralBlockers: string[] = []
    if (PILOT_PACK_KEYS.some(packKey => !(grouped.get(packKey)?.length))) structuralBlockers.push('required_pilot_releases_missing')
    const metrics = PILOT_PACK_KEYS.map(packKey => {
      const rows = grouped.get(packKey) ?? []
      if (rows.length === 0) return missingMetric(packKey, window, 'insufficient_data', ['required_pilot_release_missing'])
      if (rows.length > 1) {
        structuralBlockers.push(`duplicate_pilot_release:${packKey}`)
        return missingMetric(packKey, window, 'fail', ['duplicate_pilot_release'])
      }
      return aggregatePilotReleaseMetrics({ release: mapRelease(rows[0]!), window, invocations, feedback })
    })
    return { metrics, summary: overallSummary(metrics, metrics.filter(metric => metric.releaseId !== null).length, structuralBlockers) }
  } catch (error) {
    if (error instanceof PilotMetricsError) throw error
    throw new PilotMetricsError('pilot_metrics_query_failed', 'Pilot evidence query failed')
  }
}
