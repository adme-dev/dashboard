import { describe, expect, it, vi } from 'vitest'
import {
  createPostgresEvaluationRunTransaction,
  EvaluationPersistenceError,
  type EvaluationRunRecord
} from '~~/server/utils/ai/governance/evaluationRunPersistence'
import type { EvaluationCaseResult } from '~~/server/utils/ai/governance/contracts'

const RUN_ID = '10000000-0000-4000-8000-000000000001'
const CASE_ID = '20000000-0000-4000-8000-000000000001'
const SUITE_VERSION_ID = '30000000-0000-4000-8000-000000000001'
const CAPABILITY_VERSION_ID = '40000000-0000-4000-8000-000000000001'
const DEPARTMENT_ID = '50000000-0000-4000-8000-000000000001'
const ACTOR_ID = '60000000-0000-4000-8000-000000000001'

const identity = {
  evaluationSuiteVersionId: SUITE_VERSION_ID,
  packVersionId: null,
  capabilityVersionId: CAPABILITY_VERSION_ID,
  modelProvider: 'groq',
  modelId: 'openai/gpt-oss-120b',
  promptVersionDigest: 'a'.repeat(64),
  toolsetVersionDigest: 'b'.repeat(64)
}

function dbRunRow(overrides: Record<string, unknown> = {}) {
  return {
    id: RUN_ID,
    department_id: DEPARTMENT_ID,
    eval_suite_version_id: SUITE_VERSION_ID,
    pack_version_id: null,
    capability_version_id: CAPABILITY_VERSION_ID,
    model_provider: 'groq',
    model_id: 'openai/gpt-oss-120b',
    prompt_version_digest: 'a'.repeat(64),
    toolset_version_digest: 'b'.repeat(64),
    status: 'running',
    gate_passed: null,
    case_count: 0,
    passed_count: 0,
    failed_count: 0,
    human_review_count: 0,
    total_input_tokens: '0',
    total_output_tokens: '0',
    total_cost_usd_micros: '0',
    started_at: '2026-07-21T08:00:00.000Z',
    completed_at: null,
    created_by: ACTOR_ID,
    created_at: '2026-07-21T08:00:00.000Z',
    ...overrides
  }
}

function runRecord(overrides: Partial<EvaluationRunRecord> = {}): EvaluationRunRecord {
  return {
    id: RUN_ID,
    departmentId: DEPARTMENT_ID,
    materialIdentity: identity,
    status: 'running',
    gatePassed: null,
    caseCount: 0,
    passedCount: 0,
    failedCount: 0,
    humanReviewCount: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCostUsdMicros: 0,
    startedAt: '2026-07-21T08:00:00.000Z',
    completedAt: null,
    createdBy: ACTOR_ID,
    createdAt: '2026-07-21T08:00:00.000Z',
    ...overrides
  }
}

function result(): EvaluationCaseResult {
  return {
    evaluationRunId: RUN_ID,
    evaluationCaseId: CASE_ID,
    materialIdentity: identity,
    outcome: 'pass',
    score: 1,
    deterministicChecks: { exactToolSelection: true },
    observedTools: ['get_budget_health'],
    sourceRefs: ['fixture_campaign_snapshot'],
    prohibitedEffectsObserved: [],
    traceRef: 'trace:eval:opaque-1',
    inputTokens: 200,
    outputTokens: 80,
    costUsdMicros: 600,
    latencyMs: 400
  }
}

describe('Postgres evaluation persistence adapter', () => {
  it('creates a running run idempotently with only material identity fields', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [dbRunRow()] })
    const adapter = createPostgresEvaluationRunTransaction({ query })

    await expect(adapter.createOrGetRun(runRecord())).resolves.toMatchObject({
      id: RUN_ID,
      status: 'running',
      materialIdentity: identity
    })

    const [sql, params] = query.mock.calls[0]!
    expect(sql).toMatch(/INSERT INTO ai_eval_runs[\s\S]*ON CONFLICT \(id\) DO NOTHING/)
    expect(sql).not.toMatch(/fixture|raw_(prompt|output)|prompt_text/i)
    expect(params).toEqual([
      RUN_ID,
      DEPARTMENT_ID,
      SUITE_VERSION_ID,
      null,
      CAPABILITY_VERSION_ID,
      'groq',
      'openai/gpt-oss-120b',
      'a'.repeat(64),
      'b'.repeat(64),
      'running',
      '2026-07-21T08:00:00.000Z',
      ACTOR_ID
    ])
  })

  it('claims a queued run only while exact approval artifacts remain current and unrevoked', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [dbRunRow()] })
    const adapter = createPostgresEvaluationRunTransaction({ query })

    await adapter.claimRun({
      runId: RUN_ID,
      planDigest: 'c'.repeat(64),
      rateCardId: '70000000-0000-4000-8000-000000000001',
      approvalId: '80000000-0000-4000-8000-000000000001',
      claimedAt: '2026-08-03T02:00:00.000Z'
    })

    const [sql] = query.mock.calls[0]!
    expect(sql).toMatch(/status = 'running'[\s\S]*run\.status = 'queued'/)
    expect(sql).toMatch(/plan\.plan_digest = \$2[\s\S]*plan\.rate_card_id = \$3::uuid[\s\S]*approval\.id = \$4::uuid/)
    expect(sql).toMatch(/rate_card\.valid_from[\s\S]*rate_card\.valid_until[\s\S]*approval\.approved_at[\s\S]*approval\.expires_at/)
    expect(sql).toMatch(/rate_revocation\.rate_card_id IS NULL[\s\S]*approval_revocation\.approval_id IS NULL/)
  })

  it('locks the run before accepting evidence', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [dbRunRow()] })
    const adapter = createPostgresEvaluationRunTransaction({ query })

    await adapter.lockRun(RUN_ID)

    expect(query).toHaveBeenCalledWith(expect.stringMatching(/FROM ai_eval_runs[\s\S]*FOR UPDATE/), [RUN_ID])
  })

  it('inserts only the redacted case-result contract through parameters', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] })
    const adapter = createPostgresEvaluationRunTransaction({ query })

    await adapter.insertResult(DEPARTMENT_ID, result())

    const [sql, params] = query.mock.calls[0]!
    expect(sql).toContain('INSERT INTO ai_eval_case_results')
    expect(sql).toContain('$6::jsonb')
    expect(sql).not.toMatch(/fixture|raw_(prompt|output)|prompt_text/i)
    expect(params).toHaveLength(14)
    expect(JSON.parse(params?.[5] as string)).toEqual({ exactToolSelection: true })
  })

  it('seals only a still-running row and fails closed if it changed', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] })
    const adapter = createPostgresEvaluationRunTransaction({ query })
    const completed = runRecord({
      status: 'completed',
      gatePassed: true,
      caseCount: 1,
      passedCount: 1,
      totalInputTokens: 200,
      totalOutputTokens: 80,
      totalCostUsdMicros: 600,
      completedAt: '2026-07-21T08:01:00.000Z'
    })

    await expect(adapter.finalizeRun(RUN_ID, completed)).rejects.toBeInstanceOf(EvaluationPersistenceError)
    const [sql] = query.mock.calls[0]!
    expect(sql).toMatch(/UPDATE ai_eval_runs[\s\S]*WHERE id = \$1 AND status = 'running'/)
    expect(sql).not.toMatch(/\bDELETE\b/i)
  })
})
