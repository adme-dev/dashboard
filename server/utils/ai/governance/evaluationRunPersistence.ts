import { z } from 'zod'
import { transaction } from '~~/server/utils/db'
import {
  EvaluationCaseResultSchema,
  EvaluationMaterialIdentitySchema,
  isEvaluationEvidenceReusable,
  type EvaluationCaseResult,
  type EvaluationMaterialIdentity
} from './contracts'
import type { EvaluationRunnerResult } from './deterministicEvaluationRunner'

const UUID = z.uuid()

export type EvaluationRunStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'

export interface EvaluationRunRecord {
  id: string
  departmentId: string
  materialIdentity: EvaluationMaterialIdentity
  status: EvaluationRunStatus
  gatePassed: boolean | null
  caseCount: number
  passedCount: number
  failedCount: number
  humanReviewCount: number
  totalInputTokens: number
  totalOutputTokens: number
  totalCostUsdMicros: number
  startedAt: string | null
  completedAt: string | null
  createdBy: string
  createdAt: string
}

export interface EvaluationRunStartRequest {
  runId: string
  departmentId: string
  materialIdentity: EvaluationMaterialIdentity
  createdBy: string
}

export interface EvaluationRunClaimRequest {
  runId: string
  planDigest: string
  rateCardId: string
  approvalId: string
  claimedAt: string
}

export interface EvaluationRunTransaction {
  createOrGetRun(input: EvaluationRunRecord): Promise<EvaluationRunRecord>
  claimRun(input: EvaluationRunClaimRequest): Promise<EvaluationRunRecord | null>
  lockRun(id: string): Promise<EvaluationRunRecord | null>
  listResults(id: string): Promise<EvaluationCaseResult[]>
  insertResult(departmentId: string, result: EvaluationCaseResult): Promise<void>
  finalizeRun(id: string, terminal: EvaluationRunRecord): Promise<EvaluationRunRecord>
}

export interface EvaluationRunRepository {
  transaction<T>(callback: (transaction: EvaluationRunTransaction) => Promise<T>): Promise<T>
}

export class EvaluationPersistenceError extends Error {
  constructor(
    public readonly code: string,
    public readonly statusCode: number,
    message: string
  ) {
    super(message)
    this.name = 'EvaluationPersistenceError'
  }
}

interface EvaluationSummary {
  caseCount: number
  passedCount: number
  failedCount: number
  humanReviewCount: number
  totalInputTokens: number
  totalOutputTokens: number
  totalCostUsdMicros: number
}

function sameStartIdentity(current: EvaluationRunRecord, request: EvaluationRunStartRequest): boolean {
  return current.id === request.runId
    && current.departmentId === request.departmentId
    && current.createdBy === request.createdBy
    && isEvaluationEvidenceReusable(current.materialIdentity, request.materialIdentity)
}

function summarize(results: EvaluationCaseResult[]): EvaluationSummary & { errorCount: number } {
  return {
    caseCount: results.length,
    passedCount: results.filter(result => result.outcome === 'pass').length,
    failedCount: results.filter(result => result.outcome === 'fail' || result.outcome === 'error').length,
    humanReviewCount: results.filter(result => result.outcome === 'human_review').length,
    errorCount: results.filter(result => result.outcome === 'error').length,
    totalInputTokens: results.reduce((total, result) => total + result.inputTokens, 0),
    totalOutputTokens: results.reduce((total, result) => total + result.outputTokens, 0),
    totalCostUsdMicros: results.reduce((total, result) => total + result.costUsdMicros, 0)
  }
}

function sameSummary(record: EvaluationRunRecord, summary: EvaluationSummary): boolean {
  return record.caseCount === summary.caseCount
    && record.passedCount === summary.passedCount
    && record.failedCount === summary.failedCount
    && record.humanReviewCount === summary.humanReviewCount
    && record.totalInputTokens === summary.totalInputTokens
    && record.totalOutputTokens === summary.totalOutputTokens
    && record.totalCostUsdMicros === summary.totalCostUsdMicros
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, canonicalize(nested)]))
  }
  return value
}

function sameResults(left: EvaluationCaseResult[], right: EvaluationCaseResult[]): boolean {
  const byCase = (results: EvaluationCaseResult[]) => [...results]
    .sort((a, b) => a.evaluationCaseId.localeCompare(b.evaluationCaseId))
    .map(canonicalize)
  return JSON.stringify(byCase(left)) === JSON.stringify(byCase(right))
}

function validateRunnerResult(
  run: EvaluationRunRecord,
  raw: EvaluationRunnerResult
): { results: EvaluationCaseResult[], summary: EvaluationSummary } {
  if (!['completed', 'failed', 'cancelled'].includes(raw.status)) {
    throw new EvaluationPersistenceError('evaluation_result_inconsistent', 422, 'Evaluation result status is invalid')
  }
  if (
    (raw.status === 'completed' && (raw.failureCode !== null || typeof raw.gatePassed !== 'boolean'))
    || (raw.status === 'failed' && (!['total_cost_exceeded', 'wall_time_exceeded'].includes(raw.failureCode ?? '') || raw.gatePassed !== null))
    || (raw.status === 'cancelled' && (raw.failureCode !== 'aborted' || raw.gatePassed !== null))
  ) {
    throw new EvaluationPersistenceError('evaluation_result_inconsistent', 422, 'Evaluation terminal fields are inconsistent')
  }

  const parsed = z.array(EvaluationCaseResultSchema).max(500).safeParse(raw.results)
  if (!parsed.success) {
    throw new EvaluationPersistenceError('evaluation_result_invalid', 422, 'Evaluation case results are invalid')
  }
  const results = parsed.data.map(result => ({
    ...result,
    score: result.score === null ? null : Math.round(result.score * 1_000_000) / 1_000_000
  }))
  if (raw.status === 'completed' && results.length === 0) {
    throw new EvaluationPersistenceError(
      'evaluation_result_inconsistent',
      422,
      'A completed evaluation must contain validated case results'
    )
  }
  const caseIds = new Set<string>()
  for (const result of results) {
    if (
      result.evaluationRunId !== run.id
      || !isEvaluationEvidenceReusable(result.materialIdentity, run.materialIdentity)
      || caseIds.has(result.evaluationCaseId)
    ) {
      throw new EvaluationPersistenceError(
        'evaluation_result_identity_mismatch',
        422,
        'Evaluation results must be unique and bound to the exact run material'
      )
    }
    caseIds.add(result.evaluationCaseId)
  }

  const summary = summarize(results)
  const totalsMatch = raw.totals.caseCount === summary.caseCount
    && raw.totals.passedCount === summary.passedCount
    && raw.totals.failedCount === results.filter(result => result.outcome === 'fail').length
    && raw.totals.errorCount === summary.errorCount
    && raw.totals.humanReviewCount === summary.humanReviewCount
    && raw.totals.inputTokens === summary.totalInputTokens
    && raw.totals.outputTokens === summary.totalOutputTokens
    && raw.totals.costUsdMicros === summary.totalCostUsdMicros
  const expectedGate = results.length > 0 && summary.passedCount === results.length
  if (!totalsMatch || (raw.status === 'completed' && raw.gatePassed !== expectedGate)) {
    throw new EvaluationPersistenceError(
      'evaluation_result_inconsistent',
      422,
      'Evaluation totals or gate do not match the validated case results'
    )
  }

  return { results, summary }
}

async function createEvaluationRunWithStatus(
  rawRequest: EvaluationRunStartRequest,
  status: 'queued' | 'running',
  repository: EvaluationRunRepository = postgresEvaluationRunRepository
): Promise<EvaluationRunRecord> {
  const request: EvaluationRunStartRequest = {
    runId: UUID.parse(rawRequest.runId),
    departmentId: UUID.parse(rawRequest.departmentId),
    materialIdentity: EvaluationMaterialIdentitySchema.parse(rawRequest.materialIdentity),
    createdBy: UUID.parse(rawRequest.createdBy)
  }
  const now = new Date().toISOString()
  const initial: EvaluationRunRecord = {
    id: request.runId,
    departmentId: request.departmentId,
    materialIdentity: request.materialIdentity,
    status,
    gatePassed: null,
    caseCount: 0,
    passedCount: 0,
    failedCount: 0,
    humanReviewCount: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCostUsdMicros: 0,
    startedAt: status === 'running' ? now : null,
    completedAt: null,
    createdBy: request.createdBy,
    createdAt: now
  }

  return repository.transaction(async (tx) => {
    const current = await tx.createOrGetRun(initial)
    if (!sameStartIdentity(current, request) || current.status !== status) {
      throw new EvaluationPersistenceError(
        'evaluation_run_identity_conflict',
        409,
        'Evaluation run ID is already bound to different material or ownership'
      )
    }
    return current
  })
}

export function startEvaluationRun(rawRequest: EvaluationRunStartRequest, repository: EvaluationRunRepository = postgresEvaluationRunRepository) {
  return createEvaluationRunWithStatus(rawRequest, 'running', repository)
}

export function createQueuedEvaluationRun(rawRequest: EvaluationRunStartRequest, repository: EvaluationRunRepository = postgresEvaluationRunRepository) {
  return createEvaluationRunWithStatus(rawRequest, 'queued', repository)
}

export async function claimEvaluationRun(
  rawRequest: EvaluationRunClaimRequest,
  repository: EvaluationRunRepository = postgresEvaluationRunRepository
): Promise<EvaluationRunRecord> {
  const request = {
    runId: UUID.parse(rawRequest.runId),
    planDigest: z.string().regex(/^[a-f0-9]{64}$/).parse(rawRequest.planDigest),
    rateCardId: UUID.parse(rawRequest.rateCardId),
    approvalId: UUID.parse(rawRequest.approvalId),
    claimedAt: z.string().datetime({ offset: true }).parse(rawRequest.claimedAt)
  }
  return repository.transaction(async (tx) => {
    const claimed = await tx.claimRun(request)
    if (claimed) return claimed
    const current = await tx.lockRun(request.runId)
    if (!current) throw new EvaluationPersistenceError('evaluation_run_not_found', 404, 'Evaluation run not found')
    throw new EvaluationPersistenceError(
      current.status === 'queued' ? 'evaluation_run_claim_artifacts_invalid' : 'evaluation_run_claim_conflict',
      409,
      'Evaluation run could not be claimed for these current approval artifacts'
    )
  })
}

export async function finalizeEvaluationRun(
  rawRunId: string,
  result: EvaluationRunnerResult,
  repository: EvaluationRunRepository = postgresEvaluationRunRepository
): Promise<EvaluationRunRecord> {
  const runId = UUID.parse(rawRunId)
  return repository.transaction(async (tx) => {
    const run = await tx.lockRun(runId)
    if (!run) {
      throw new EvaluationPersistenceError('evaluation_run_not_found', 404, 'Evaluation run not found')
    }

    const validated = validateRunnerResult(run, result)
    if (run.status !== 'running') {
      const persisted = await tx.listResults(run.id)
      if (
        run.status === result.status
        && run.gatePassed === result.gatePassed
        && sameSummary(run, validated.summary)
        && sameResults(persisted, validated.results)
      ) return run
      throw new EvaluationPersistenceError(
        'evaluation_run_terminal_conflict',
        409,
        'Evaluation run is already sealed with different terminal evidence'
      )
    }

    for (const caseResult of validated.results) {
      await tx.insertResult(run.departmentId, caseResult)
    }
    return tx.finalizeRun(run.id, {
      ...run,
      status: result.status,
      gatePassed: result.gatePassed,
      ...validated.summary,
      completedAt: new Date().toISOString()
    })
  })
}

interface EvaluationSqlClient {
  query(sql: string, params?: unknown[]): Promise<{ rows: unknown[] }>
}

type DbEvaluationRunRow = {
  id: string
  department_id: string
  eval_suite_version_id: string
  pack_version_id: string | null
  capability_version_id: string | null
  model_provider: string
  model_id: string
  prompt_version_digest: string
  toolset_version_digest: string
  status: EvaluationRunStatus
  gate_passed: boolean | null
  case_count: number
  passed_count: number
  failed_count: number
  human_review_count: number
  total_input_tokens: string | number
  total_output_tokens: string | number
  total_cost_usd_micros: string | number
  started_at: string | Date | null
  completed_at: string | Date | null
  created_by: string
  created_at: string | Date
}

type DbEvaluationCaseResultRow = {
  eval_run_id: string
  eval_case_id: string
  outcome: EvaluationCaseResult['outcome']
  score: string | number | null
  deterministic_checks: Record<string, unknown>
  observed_tools: string[]
  source_refs: string[]
  prohibited_effects_observed: string[]
  trace_ref: string | null
  input_tokens: number
  output_tokens: number
  cost_usd_micros: string | number
  latency_ms: number
}

const RUN_COLUMNS = `id, department_id, eval_suite_version_id, pack_version_id,
  capability_version_id, model_provider, model_id, prompt_version_digest,
  toolset_version_digest, status, gate_passed, case_count, passed_count,
  failed_count, human_review_count, total_input_tokens, total_output_tokens,
  total_cost_usd_micros, started_at, completed_at, created_by, created_at`
const CLAIMED_RUN_COLUMNS = `run.id, run.department_id, run.eval_suite_version_id, run.pack_version_id,
  run.capability_version_id, run.model_provider, run.model_id, run.prompt_version_digest,
  run.toolset_version_digest, run.status, run.gate_passed, run.case_count, run.passed_count,
  run.failed_count, run.human_review_count, run.total_input_tokens, run.total_output_tokens,
  run.total_cost_usd_micros, run.started_at, run.completed_at, run.created_by, run.created_at`

function safeDbInteger(value: string | number): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new EvaluationPersistenceError('evaluation_evidence_invalid', 500, 'Stored evaluation totals are invalid')
  }
  return parsed
}

function mapRun(row: DbEvaluationRunRow): EvaluationRunRecord {
  return {
    id: row.id,
    departmentId: row.department_id,
    materialIdentity: EvaluationMaterialIdentitySchema.parse({
      evaluationSuiteVersionId: row.eval_suite_version_id,
      packVersionId: row.pack_version_id,
      capabilityVersionId: row.capability_version_id,
      modelProvider: row.model_provider,
      modelId: row.model_id,
      promptVersionDigest: row.prompt_version_digest,
      toolsetVersionDigest: row.toolset_version_digest
    }),
    status: row.status,
    gatePassed: row.gate_passed,
    caseCount: row.case_count,
    passedCount: row.passed_count,
    failedCount: row.failed_count,
    humanReviewCount: row.human_review_count,
    totalInputTokens: safeDbInteger(row.total_input_tokens),
    totalOutputTokens: safeDbInteger(row.total_output_tokens),
    totalCostUsdMicros: safeDbInteger(row.total_cost_usd_micros),
    startedAt: row.started_at ? new Date(row.started_at).toISOString() : null,
    completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
    createdBy: row.created_by,
    createdAt: new Date(row.created_at).toISOString()
  }
}

function mapResult(row: DbEvaluationCaseResultRow, identity: EvaluationMaterialIdentity): EvaluationCaseResult {
  return EvaluationCaseResultSchema.parse({
    evaluationRunId: row.eval_run_id,
    evaluationCaseId: row.eval_case_id,
    materialIdentity: identity,
    outcome: row.outcome,
    score: row.score === null ? null : Number(row.score),
    deterministicChecks: row.deterministic_checks,
    observedTools: row.observed_tools,
    sourceRefs: row.source_refs,
    prohibitedEffectsObserved: row.prohibited_effects_observed,
    traceRef: row.trace_ref,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    costUsdMicros: safeDbInteger(row.cost_usd_micros),
    latencyMs: row.latency_ms
  })
}

export function createPostgresEvaluationRunTransaction(db: EvaluationSqlClient): EvaluationRunTransaction {
  return {
    async createOrGetRun(input) {
      await db.query(
        `INSERT INTO ai_eval_runs (
           id, department_id, eval_suite_version_id, pack_version_id, capability_version_id,
           model_provider, model_id, prompt_version_digest, toolset_version_digest,
           status, started_at, created_by
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (id) DO NOTHING`,
        [
          input.id,
          input.departmentId,
          input.materialIdentity.evaluationSuiteVersionId,
          input.materialIdentity.packVersionId,
          input.materialIdentity.capabilityVersionId,
          input.materialIdentity.modelProvider,
          input.materialIdentity.modelId,
          input.materialIdentity.promptVersionDigest,
          input.materialIdentity.toolsetVersionDigest,
          input.status,
          input.startedAt,
          input.createdBy
        ]
      )
      const result = await db.query(`SELECT ${RUN_COLUMNS} FROM ai_eval_runs WHERE id = $1`, [input.id])
      const row = result.rows[0] as DbEvaluationRunRow | undefined
      if (!row) throw new EvaluationPersistenceError('evaluation_run_create_failed', 409, 'Evaluation run could not be created')
      return mapRun(row)
    },

    async claimRun(input) {
      const result = await db.query(
        `UPDATE ai_eval_runs run
            SET status = 'running', started_at = $5::timestamptz
           FROM ai_eval_execution_plans plan
           JOIN ai_eval_model_rate_cards rate_card ON rate_card.id = plan.rate_card_id
           JOIN ai_eval_cost_approvals approval
             ON approval.evaluation_run_id = plan.evaluation_run_id
            AND approval.plan_digest = plan.plan_digest
            AND approval.rate_card_id = plan.rate_card_id
           LEFT JOIN ai_eval_model_rate_card_revocations rate_revocation
             ON rate_revocation.rate_card_id = rate_card.id
           LEFT JOIN ai_eval_cost_approval_revocations approval_revocation
             ON approval_revocation.approval_id = approval.id
          WHERE run.id = $1::uuid
            AND run.status = 'queued'
            AND plan.evaluation_run_id = run.id
            AND plan.plan_digest = $2
            AND plan.rate_card_id = $3::uuid
            AND approval.id = $4::uuid
            AND $5::timestamptz >= rate_card.valid_from
            AND $5::timestamptz < rate_card.valid_until
            AND $5::timestamptz >= approval.approved_at
            AND $5::timestamptz < approval.expires_at
            AND approval.max_spend_usd_micros >= plan.estimated_upper_bound_usd_micros
            AND rate_revocation.rate_card_id IS NULL
            AND approval_revocation.approval_id IS NULL
        RETURNING ${CLAIMED_RUN_COLUMNS}`,
        [input.runId, input.planDigest, input.rateCardId, input.approvalId, input.claimedAt]
      )
      const row = result.rows[0] as DbEvaluationRunRow | undefined
      return row ? mapRun(row) : null
    },

    async lockRun(id) {
      const result = await db.query(
        `SELECT ${RUN_COLUMNS} FROM ai_eval_runs WHERE id = $1 FOR UPDATE`,
        [id]
      )
      const row = result.rows[0] as DbEvaluationRunRow | undefined
      return row ? mapRun(row) : null
    },

    async listResults(id) {
      const runResult = await db.query(`SELECT ${RUN_COLUMNS} FROM ai_eval_runs WHERE id = $1`, [id])
      const runRow = runResult.rows[0] as DbEvaluationRunRow | undefined
      if (!runRow) return []
      const run = mapRun(runRow)
      const result = await db.query(
        `SELECT eval_run_id, eval_case_id, outcome, score, deterministic_checks,
                observed_tools, source_refs, prohibited_effects_observed, trace_ref,
                input_tokens, output_tokens, cost_usd_micros, latency_ms
           FROM ai_eval_case_results
          WHERE eval_run_id = $1
          ORDER BY eval_case_id`,
        [id]
      )
      return result.rows.map(row => mapResult(row as DbEvaluationCaseResultRow, run.materialIdentity))
    },

    async insertResult(departmentId, result) {
      await db.query(
        `INSERT INTO ai_eval_case_results (
           eval_run_id, eval_case_id, department_id, outcome, score,
           deterministic_checks, observed_tools, source_refs, prohibited_effects_observed,
           trace_ref, input_tokens, output_tokens, cost_usd_micros, latency_ms
         ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          result.evaluationRunId,
          result.evaluationCaseId,
          departmentId,
          result.outcome,
          result.score,
          JSON.stringify(result.deterministicChecks),
          result.observedTools,
          result.sourceRefs,
          result.prohibitedEffectsObserved,
          result.traceRef,
          result.inputTokens,
          result.outputTokens,
          result.costUsdMicros,
          result.latencyMs
        ]
      )
    },

    async finalizeRun(id, terminal) {
      const result = await db.query(
        `UPDATE ai_eval_runs
            SET status = $2, gate_passed = $3, case_count = $4, passed_count = $5,
                failed_count = $6, human_review_count = $7, total_input_tokens = $8,
                total_output_tokens = $9, total_cost_usd_micros = $10, completed_at = $11
          WHERE id = $1 AND status = 'running'
        RETURNING ${RUN_COLUMNS}`,
        [
          id,
          terminal.status,
          terminal.gatePassed,
          terminal.caseCount,
          terminal.passedCount,
          terminal.failedCount,
          terminal.humanReviewCount,
          terminal.totalInputTokens,
          terminal.totalOutputTokens,
          terminal.totalCostUsdMicros,
          terminal.completedAt
        ]
      )
      const row = result.rows[0] as DbEvaluationRunRow | undefined
      if (!row) {
        throw new EvaluationPersistenceError('evaluation_run_finalize_conflict', 409, 'Evaluation run could not be sealed')
      }
      return mapRun(row)
    }
  }
}

export const postgresEvaluationRunRepository: EvaluationRunRepository = {
  transaction(callback) {
    return transaction(db => callback(createPostgresEvaluationRunTransaction(db as unknown as EvaluationSqlClient)))
  }
}
