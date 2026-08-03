import { describe, expect, it } from 'vitest'
import {
  planEvaluationExecution,
  type EvaluationExecutionPlanningRequest
} from '~~/server/utils/ai/governance/evaluationExecutionAdmission'

const NOW = new Date('2026-07-22T04:00:00.000Z')
const APPROVER_ID = '10000000-0000-4000-8000-000000000001'
const APPROVAL_ID = '10000000-0000-4000-8000-000000000002'
const RUN_ID = '10000000-0000-4000-8000-000000000003'
const TRUSTED_DEPS = {
  now: () => NOW,
  isTrustedApproval: () => true,
  isTrustedRateCard: () => true
}

const materialIdentity = {
  evaluationSuiteVersionId: '20000000-0000-4000-8000-000000000001',
  packVersionId: null,
  capabilityVersionId: '30000000-0000-4000-8000-000000000001',
  modelProvider: 'groq',
  modelId: 'openai/gpt-oss-120b',
  promptVersionDigest: 'a'.repeat(64),
  toolsetVersionDigest: 'b'.repeat(64)
}

function modelRequest(
  overrides: Partial<EvaluationExecutionPlanningRequest> = {}
): EvaluationExecutionPlanningRequest {
  return {
    mode: 'model_simulation',
    evaluationRunId: RUN_ID,
    materialIdentity,
    caseCount: 3,
    availableTools: ['search_knowledge', 'get_tasks'],
    budget: {
      maxCases: 50,
      maxInputTokensPerCase: 8_000,
      maxOutputTokensPerCase: 1_200,
      maxCostUsdMicrosPerCase: 40_000,
      maxLatencyMsPerCase: 20_000,
      maxTotalCostUsdMicros: 1_000_000,
      maxWallTimeMs: 60_000
    },
    rateCard: {
      modelProvider: 'groq',
      modelId: 'openai/gpt-oss-120b',
      inputUsdMicrosPerMillionTokens: 150_000,
      outputUsdMicrosPerMillionTokens: 600_000,
      sourceDigest: 'c'.repeat(64),
      validFrom: '2026-07-22T00:00:00.000Z',
      validUntil: '2026-07-29T00:00:00.000Z'
    },
    ...overrides
  } as EvaluationExecutionPlanningRequest
}

describe('evaluation execution admission', () => {
  it('produces a zero-call manifest preflight without a rate card or approval', () => {
    const result = planEvaluationExecution({
      mode: 'manifest_only',
      evaluationRunId: RUN_ID,
      materialIdentity,
      caseCount: 3,
      availableTools: ['get_tasks', 'search_knowledge'],
      budget: modelRequest().budget
    }, { now: () => NOW })

    expect(result).toMatchObject({
      decision: 'preflight_only',
      estimatedUpperBoundUsdMicros: 0,
      modelCallsAllowed: false,
      sideEffectsAllowed: false
    })
    expect(result.planDigest).toMatch(/^[a-f0-9]{64}$/)
  })

  it('requires an exact approval and reports the integer upper-bound cost', () => {
    const result = planEvaluationExecution(modelRequest(), TRUSTED_DEPS)

    expect(result).toMatchObject({
      decision: 'requires_cost_approval',
      estimatedUpperBoundUsdMicros: 5_760,
      modelCallsAllowed: false,
      sideEffectsAllowed: false,
      reason: 'cost_approval_required'
    })
  })

  it('admits only an approval bound to the exact plan digest and sufficient spend', () => {
    const pending = planEvaluationExecution(modelRequest(), TRUSTED_DEPS)
    expect(pending.decision).toBe('requires_cost_approval')

    const approved = planEvaluationExecution(modelRequest({
      approval: {
        approvalId: APPROVAL_ID,
        planDigest: pending.planDigest,
        approvedBy: APPROVER_ID,
        reason: 'Approved for the bounded department evaluation suite.',
        maxSpendUsdMicros: 5_760,
        approvedAt: '2026-07-22T03:55:00.000Z',
        expiresAt: '2026-07-22T05:00:00.000Z'
      }
    }), TRUSTED_DEPS)

    expect(approved).toMatchObject({
      decision: 'approved',
      estimatedUpperBoundUsdMicros: 5_760,
      modelCallsAllowed: true,
      sideEffectsAllowed: false,
      executionEnvelope: {
        executionMode: 'simulation',
        sideEffectsAllowed: false,
        evaluationRunId: RUN_ID,
        approvalId: APPROVAL_ID,
        maxModelCalls: 3,
        planDigest: pending.planDigest,
        approvedBy: APPROVER_ID,
        notAfter: '2026-07-22T05:00:00.000Z',
        maxSpendUsdMicros: 5_760,
        maxCostUsdMicrosPerCase: 1_920
      }
    })
  })

  it('never enlarges the execution envelope when approval exceeds the planned upper bound', () => {
    const pending = planEvaluationExecution(modelRequest(), TRUSTED_DEPS)
    const approved = planEvaluationExecution(modelRequest({
      approval: {
        approvalId: APPROVAL_ID,
        planDigest: pending.planDigest,
        approvedBy: APPROVER_ID,
        reason: 'Approved with headroom for the bounded evaluation suite.',
        maxSpendUsdMicros: 10_000,
        approvedAt: '2026-07-22T03:55:00.000Z',
        expiresAt: '2026-07-22T05:00:00.000Z'
      }
    }), TRUSTED_DEPS)

    expect(approved.decision).toBe('approved')
    if (approved.decision === 'approved') {
      expect(approved.executionEnvelope.maxSpendUsdMicros).toBe(5_760)
    }
  })

  it.each([
    ['digest mismatch', { planDigest: 'd'.repeat(64) }, 'approval_plan_mismatch'],
    ['expired approval', { expiresAt: '2026-07-22T03:59:59.000Z' }, 'approval_expired'],
    ['insufficient approved spend', { maxSpendUsdMicros: 5_759 }, 'approval_spend_insufficient']
  ])('rejects %s', (_label, approvalOverride, expectedCode) => {
    const pending = planEvaluationExecution(modelRequest(), TRUSTED_DEPS)
    const result = planEvaluationExecution(modelRequest({
      approval: {
        approvalId: APPROVAL_ID,
        planDigest: pending.planDigest,
        approvedBy: APPROVER_ID,
        reason: 'Approved for the bounded department evaluation suite.',
        maxSpendUsdMicros: 5_760,
        approvedAt: '2026-07-22T03:55:00.000Z',
        expiresAt: '2026-07-22T05:00:00.000Z',
        ...approvalOverride
      }
    }), TRUSTED_DEPS)

    expect(result).toMatchObject({ decision: 'rejected', modelCallsAllowed: false })
    if (result.decision === 'rejected') expect(result.issues).toContainEqual(expect.objectContaining({ code: expectedCode }))
  })

  it('rejects an approval that was not authenticated by a trusted governance store', () => {
    const pending = planEvaluationExecution(modelRequest(), TRUSTED_DEPS)
    const result = planEvaluationExecution(modelRequest({
      approval: {
        approvalId: APPROVAL_ID,
        planDigest: pending.planDigest,
        approvedBy: APPROVER_ID,
        reason: 'Approved for the bounded department evaluation suite.',
        maxSpendUsdMicros: 5_760,
        approvedAt: '2026-07-22T03:55:00.000Z',
        expiresAt: '2026-07-22T05:00:00.000Z'
      }
    }), { now: () => NOW, isTrustedRateCard: () => true })

    expect(result).toMatchObject({ decision: 'rejected', modelCallsAllowed: false })
    if (result.decision === 'rejected') {
      expect(result.issues).toContainEqual(expect.objectContaining({ code: 'approval_untrusted' }))
    }
  })

  it.each([
    ['missing rate card', { rateCard: undefined }, 'rate_card_required'],
    ['provider mismatch', { rateCard: { ...modelRequest().rateCard!, modelProvider: 'workers_ai' } }, 'rate_card_model_mismatch'],
    ['stale rate card', { rateCard: { ...modelRequest().rateCard!, validUntil: '2026-07-22T03:59:59.000Z' } }, 'rate_card_expired']
  ])('fails closed for a %s', (_label, override, expectedCode) => {
    const result = planEvaluationExecution(
      modelRequest(override as Partial<EvaluationExecutionPlanningRequest>),
      TRUSTED_DEPS
    )

    expect(result).toMatchObject({ decision: 'rejected', modelCallsAllowed: false })
    if (result.decision === 'rejected') expect(result.issues).toContainEqual(expect.objectContaining({ code: expectedCode }))
  })

  it('rejects a rate-derived maximum above the runner cost ceilings', () => {
    const result = planEvaluationExecution(modelRequest({
      rateCard: {
        ...modelRequest().rateCard!,
        inputUsdMicrosPerMillionTokens: 50_000_000,
        outputUsdMicrosPerMillionTokens: 50_000_000
      }
    }), TRUSTED_DEPS)

    expect(result).toMatchObject({ decision: 'rejected', modelCallsAllowed: false })
    if (result.decision === 'rejected') {
      expect(result.issues.map(issue => issue.code)).toEqual(expect.arrayContaining([
        'per_case_cost_budget_inconsistent',
        'total_cost_budget_inconsistent'
      ]))
    }
  })

  it('rejects a manifest whose case count exceeds the runner ceiling without enabling model calls', () => {
    const result = planEvaluationExecution({
      mode: 'manifest_only',
      evaluationRunId: RUN_ID,
      materialIdentity,
      caseCount: 51,
      availableTools: [],
      budget: modelRequest().budget
    }, { now: () => NOW })

    expect(result).toMatchObject({ decision: 'rejected', modelCallsAllowed: false })
    if (result.decision === 'rejected') {
      expect(result.issues).toContainEqual(expect.objectContaining({ code: 'case_count_exceeds_budget' }))
    }
  })

  it('fingerprints equivalent tool sets identically and material changes differently', () => {
    const first = planEvaluationExecution(modelRequest(), TRUSTED_DEPS)
    const reordered = planEvaluationExecution(modelRequest({
      availableTools: ['get_tasks', 'search_knowledge']
    }), TRUSTED_DEPS)
    const changed = planEvaluationExecution(modelRequest({ caseCount: 4 }), TRUSTED_DEPS)

    expect(reordered.planDigest).toBe(first.planDigest)
    expect(changed.planDigest).not.toBe(first.planDigest)
  })

  it('rejects a rate card that was not authenticated by the pricing source', () => {
    const result = planEvaluationExecution(modelRequest(), { now: () => NOW })

    expect(result).toMatchObject({ decision: 'rejected', modelCallsAllowed: false })
    if (result.decision === 'rejected') {
      expect(result.issues).toContainEqual(expect.objectContaining({ code: 'rate_card_untrusted' }))
    }
  })

  it('fails closed when the admission clock is invalid', () => {
    const result = planEvaluationExecution(modelRequest(), {
      ...TRUSTED_DEPS,
      now: () => new Date(Number.NaN)
    })

    expect(result).toMatchObject({ decision: 'rejected', modelCallsAllowed: false })
    if (result.decision === 'rejected') {
      expect(result.issues).toContainEqual(expect.objectContaining({ code: 'clock_invalid' }))
    }
  })
})
