import { describe, expect, it } from 'vitest'
import {
  EvaluationPersistenceError,
  finalizeEvaluationRun,
  startEvaluationRun,
  type EvaluationRunRecord,
  type EvaluationRunRepository,
  type EvaluationRunTransaction
} from '~~/server/utils/ai/governance/evaluationRunPersistence'
import type { EvaluationCaseResult } from '~~/server/utils/ai/governance/contracts'
import type { EvaluationRunnerResult } from '~~/server/utils/ai/governance/deterministicEvaluationRunner'

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

function runningRun(overrides: Partial<EvaluationRunRecord> = {}): EvaluationRunRecord {
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

function caseResult(overrides: Partial<EvaluationCaseResult> = {}): EvaluationCaseResult {
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
    latencyMs: 400,
    ...overrides
  }
}

function runnerResult(overrides: Partial<EvaluationRunnerResult> = {}): EvaluationRunnerResult {
  return {
    status: 'completed',
    gatePassed: true,
    failureCode: null,
    results: [caseResult()],
    totals: {
      caseCount: 1,
      passedCount: 1,
      failedCount: 0,
      humanReviewCount: 0,
      errorCount: 0,
      inputTokens: 200,
      outputTokens: 80,
      costUsdMicros: 600
    },
    ...overrides
  }
}

class FakeRepository implements EvaluationRunRepository, EvaluationRunTransaction {
  current: EvaluationRunRecord | null
  results: EvaluationCaseResult[] = []
  insertCount = 0
  finalizeCount = 0

  constructor(current: EvaluationRunRecord | null = null) {
    this.current = current
  }

  async transaction<T>(callback: (transaction: EvaluationRunTransaction) => Promise<T>): Promise<T> {
    return callback(this)
  }

  async createOrGetRun(input: EvaluationRunRecord) {
    if (!this.current) this.current = structuredClone(input)
    return structuredClone(this.current)
  }

  async lockRun(id: string) {
    return this.current?.id === id ? structuredClone(this.current) : null
  }

  async listResults(id: string) {
    return id === this.current?.id ? structuredClone(this.results) : []
  }

  async insertResult(_departmentId: string, result: EvaluationCaseResult) {
    this.insertCount += 1
    this.results.push(structuredClone(result))
  }

  async finalizeRun(id: string, terminal: EvaluationRunRecord) {
    if (id !== this.current?.id) throw new Error('missing fake run')
    this.finalizeCount += 1
    this.current = structuredClone(terminal)
    return structuredClone(terminal)
  }
}

describe('evaluation run persistence', () => {
  it('starts a version-bound running run idempotently', async () => {
    const repository = new FakeRepository()
    const request = {
      runId: RUN_ID,
      departmentId: DEPARTMENT_ID,
      materialIdentity: identity,
      createdBy: ACTOR_ID
    }

    const first = await startEvaluationRun(request, repository)
    const second = await startEvaluationRun(request, repository)

    expect(first).toMatchObject({ status: 'running', gatePassed: null, materialIdentity: identity })
    expect(second).toEqual(first)
  })

  it('rejects reuse of a run id for different material', async () => {
    const repository = new FakeRepository(runningRun())

    await expect(startEvaluationRun({
      runId: RUN_ID,
      departmentId: DEPARTMENT_ID,
      materialIdentity: { ...identity, modelId: 'different-model' },
      createdBy: ACTOR_ID
    }, repository)).rejects.toMatchObject({ code: 'evaluation_run_identity_conflict', statusCode: 409 })
  })

  it('atomically stores redacted results and seals a completed summary', async () => {
    const repository = new FakeRepository(runningRun())

    const result = await finalizeEvaluationRun(RUN_ID, runnerResult(), repository)

    expect(repository.results).toEqual([caseResult()])
    expect(result).toMatchObject({
      status: 'completed',
      gatePassed: true,
      caseCount: 1,
      passedCount: 1,
      failedCount: 0,
      completedAt: expect.any(String)
    })
  })

  it('counts executor errors as failed database evidence', async () => {
    const repository = new FakeRepository(runningRun())
    const errorCase = caseResult({ outcome: 'error', score: null })

    const result = await finalizeEvaluationRun(RUN_ID, runnerResult({
      gatePassed: false,
      results: [errorCase],
      totals: { ...runnerResult().totals, passedCount: 0, errorCount: 1 }
    }), repository)

    expect(result.failedCount).toBe(1)
  })

  it('normalizes scores to the database precision before sealing evidence', async () => {
    const repository = new FakeRepository(runningRun())

    await finalizeEvaluationRun(RUN_ID, runnerResult({
      results: [caseResult({ score: 1 / 3 })]
    }), repository)

    expect(repository.results[0]?.score).toBe(0.333333)
  })

  it('persists partial evidence safely for a failed run', async () => {
    const repository = new FakeRepository(runningRun())

    const result = await finalizeEvaluationRun(RUN_ID, runnerResult({
      status: 'failed',
      gatePassed: null,
      failureCode: 'total_cost_exceeded'
    }), repository)

    expect(result).toMatchObject({ status: 'failed', gatePassed: null, caseCount: 1 })
  })

  it('rejects a result bound to another run or material identity before writing', async () => {
    const repository = new FakeRepository(runningRun())

    await expect(finalizeEvaluationRun(RUN_ID, runnerResult({
      results: [caseResult({ evaluationRunId: '70000000-0000-4000-8000-000000000001' })]
    }), repository)).rejects.toBeInstanceOf(EvaluationPersistenceError)

    expect(repository.insertCount).toBe(0)
    expect(repository.finalizeCount).toBe(0)
  })

  it('rejects inconsistent caller totals and gate values before writing', async () => {
    const repository = new FakeRepository(runningRun())

    await expect(finalizeEvaluationRun(RUN_ID, runnerResult({
      totals: { ...runnerResult().totals, costUsdMicros: 999 }
    }), repository)).rejects.toMatchObject({ code: 'evaluation_result_inconsistent', statusCode: 422 })

    expect(repository.insertCount).toBe(0)
  })

  it('rejects an empty completed run before writing', async () => {
    const repository = new FakeRepository(runningRun())

    await expect(finalizeEvaluationRun(RUN_ID, runnerResult({
      gatePassed: false,
      results: [],
      totals: {
        caseCount: 0,
        passedCount: 0,
        failedCount: 0,
        humanReviewCount: 0,
        errorCount: 0,
        inputTokens: 0,
        outputTokens: 0,
        costUsdMicros: 0
      }
    }), repository)).rejects.toMatchObject({ code: 'evaluation_result_inconsistent', statusCode: 422 })

    expect(repository.insertCount).toBe(0)
  })

  it('returns exact terminal evidence on retry without duplicate rows', async () => {
    const completed = runningRun({
      status: 'completed',
      gatePassed: true,
      caseCount: 1,
      passedCount: 1,
      totalInputTokens: 200,
      totalOutputTokens: 80,
      totalCostUsdMicros: 600,
      completedAt: '2026-07-21T08:01:00.000Z'
    })
    const repository = new FakeRepository(completed)
    repository.results = [caseResult()]

    const result = await finalizeEvaluationRun(RUN_ID, runnerResult(), repository)

    expect(result).toEqual(completed)
    expect(repository.insertCount).toBe(0)
    expect(repository.finalizeCount).toBe(0)
  })

  it('fails closed when a terminal retry differs from sealed evidence', async () => {
    const repository = new FakeRepository(runningRun({
      status: 'cancelled',
      completedAt: '2026-07-21T08:01:00.000Z'
    }))

    await expect(finalizeEvaluationRun(RUN_ID, runnerResult(), repository))
      .rejects.toMatchObject({ code: 'evaluation_run_terminal_conflict', statusCode: 409 })
  })
})
