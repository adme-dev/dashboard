import { describe, expect, it, vi } from 'vitest'
import {
  createStoredEvaluationAdmissionDependencies,
  createPostgresEvaluationApprovalStore,
  type EvaluationApprovalStoreError,
  type EvaluationApprovalSqlClient
} from '~~/server/utils/ai/governance/evaluationApprovalStore'
import { planEvaluationExecution } from '~~/server/utils/ai/governance/evaluationExecutionAdmission'

const IDS = {
  rateCard: '10000000-0000-4000-8000-000000000001',
  run: '10000000-0000-4000-8000-000000000002',
  department: '10000000-0000-4000-8000-000000000003',
  actor: '10000000-0000-4000-8000-000000000004',
  approval: '10000000-0000-4000-8000-000000000005'
}

const rateCard = {
  id: IDS.rateCard,
  modelProvider: 'groq',
  modelId: 'openai/gpt-oss-120b',
  inputUsdMicrosPerMillionTokens: 150_000,
  outputUsdMicrosPerMillionTokens: 600_000,
  sourceDigest: 'a'.repeat(64),
  validFrom: '2026-07-22T00:00:00.000Z',
  validUntil: '2026-07-29T00:00:00.000Z',
  createdBy: IDS.actor,
  createdAt: '2026-07-22T00:00:00.000Z'
}

describe('Postgres evaluation approval store', () => {
  it('registers immutable model pricing through parameters', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{
      id: IDS.rateCard,
      model_provider: rateCard.modelProvider,
      model_id: rateCard.modelId,
      input_usd_micros_per_million_tokens: String(rateCard.inputUsdMicrosPerMillionTokens),
      output_usd_micros_per_million_tokens: String(rateCard.outputUsdMicrosPerMillionTokens),
      source_digest: rateCard.sourceDigest,
      valid_from: rateCard.validFrom,
      valid_until: rateCard.validUntil,
      created_by: IDS.actor,
      created_at: rateCard.createdAt
    }] })
    const store = createPostgresEvaluationApprovalStore({ query })

    const { createdAt: _createdAt, ...input } = rateCard
    await expect(store.registerRateCard(input)).resolves.toEqual(rateCard)

    const [sql, params] = query.mock.calls[0]!
    expect(sql).toMatch(/INSERT INTO ai_eval_model_rate_cards/)
    expect(sql).not.toMatch(/\bUPDATE\b|\bDELETE\b/i)
    expect(params).toContain(rateCard.sourceDigest)
    expect(String(sql)).not.toContain(rateCard.modelId)
  })

  it('persists one exact execution plan before approval', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{
      evaluation_run_id: IDS.run,
      department_id: IDS.department,
      plan_digest: 'b'.repeat(64),
      rate_card_id: IDS.rateCard,
      estimated_upper_bound_usd_micros: '5760',
      max_model_calls: 3,
      created_by: IDS.actor,
      created_at: '2026-07-22T01:00:00.000Z'
    }] })
    const store = createPostgresEvaluationApprovalStore({ query })

    await store.persistPlan({
      evaluationRunId: IDS.run,
      departmentId: IDS.department,
      planDigest: 'b'.repeat(64),
      rateCardId: IDS.rateCard,
      estimatedUpperBoundUsdMicros: 5_760,
      maxModelCalls: 3,
      createdBy: IDS.actor
    })

    const [sql, params] = query.mock.calls[0]!
    expect(sql).toMatch(/INSERT INTO ai_eval_execution_plans[\s\S]*ON CONFLICT \(evaluation_run_id\) DO NOTHING/)
    expect(params).toEqual([
      IDS.run, IDS.department, 'b'.repeat(64), IDS.rateCard, 5_760, 3, IDS.actor
    ])
  })

  it('rejects malformed plan commands before querying PostgreSQL', async () => {
    const query = vi.fn()
    const store = createPostgresEvaluationApprovalStore({ query })

    await expect(store.persistPlan({
      evaluationRunId: 'not-a-uuid',
      departmentId: IDS.department,
      planDigest: 'b'.repeat(64),
      rateCardId: IDS.rateCard,
      estimatedUpperBoundUsdMicros: 5_760,
      maxModelCalls: 3,
      createdBy: IDS.actor
    })).rejects.toThrow()
    expect(query).not.toHaveBeenCalled()
  })

  it('rejects a replay whose stored plan differs from the submitted identity', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{
      evaluation_run_id: IDS.run,
      department_id: IDS.department,
      plan_digest: 'c'.repeat(64),
      rate_card_id: IDS.rateCard,
      estimated_upper_bound_usd_micros: '5760',
      max_model_calls: 3,
      created_by: IDS.actor,
      created_at: '2026-07-22T01:00:00.000Z'
    }] })
    const store = createPostgresEvaluationApprovalStore({ query })

    await expect(store.persistPlan({
      evaluationRunId: IDS.run,
      departmentId: IDS.department,
      planDigest: 'b'.repeat(64),
      rateCardId: IDS.rateCard,
      estimatedUpperBoundUsdMicros: 5_760,
      maxModelCalls: 3,
      createdBy: IDS.actor
    })).rejects.toMatchObject<EvaluationApprovalStoreError>({ code: 'plan_conflict' })
  })

  it('approves only a current unrevoked stored plan with sufficient spend', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{
      id: IDS.approval,
      evaluation_run_id: IDS.run,
      rate_card_id: IDS.rateCard,
      plan_digest: 'b'.repeat(64),
      approved_by: IDS.actor,
      reason: 'Approved for the bounded evaluation suite.',
      max_spend_usd_micros: '5760',
      approved_at: '2026-07-22T02:00:00.000Z',
      expires_at: '2026-07-22T03:00:00.000Z'
    }] })
    const store = createPostgresEvaluationApprovalStore({ query })

    await store.approvePlan({
      approvalId: IDS.approval,
      evaluationRunId: IDS.run,
      planDigest: 'b'.repeat(64),
      approvedBy: IDS.actor,
      reason: 'Approved for the bounded evaluation suite.',
      maxSpendUsdMicros: 5_760,
      expiresAt: '2026-07-22T03:00:00.000Z'
    })

    const [sql] = query.mock.calls[0]!
    expect(sql).toMatch(/INSERT INTO ai_eval_cost_approvals[\s\S]*SELECT/)
    expect(sql).toMatch(/\$6::bigint >= plan\.estimated_upper_bound_usd_micros/)
    expect(sql).toMatch(/\$6, NOW\(\), \$7::timestamptz/)
    expect(sql).toMatch(/rate_revocation\.rate_card_id IS NULL/)
    expect(sql).toMatch(/approval\.id IS NULL/)
  })

  it('loads trust artifacts only for the exact run, digest and unrevoked records', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{
      rate_card_id: IDS.rateCard,
      model_provider: rateCard.modelProvider,
      model_id: rateCard.modelId,
      input_usd_micros_per_million_tokens: '150000',
      output_usd_micros_per_million_tokens: '600000',
      source_digest: rateCard.sourceDigest,
      valid_from: rateCard.validFrom,
      valid_until: rateCard.validUntil,
      approval_id: IDS.approval,
      plan_digest: 'b'.repeat(64),
      approved_by: IDS.actor,
      reason: 'Approved for the bounded evaluation suite.',
      max_spend_usd_micros: '5760',
      approved_at: '2026-07-22T02:00:00.000Z',
      expires_at: '2026-07-22T03:00:00.000Z'
    }] })
    const store = createPostgresEvaluationApprovalStore({ query } as EvaluationApprovalSqlClient)

    const artifacts = await store.loadTrustedArtifacts({
      evaluationRunId: IDS.run,
      planDigest: 'b'.repeat(64),
      rateCardId: IDS.rateCard,
      approvalId: IDS.approval
    })

    expect(artifacts).toMatchObject({
      rateCard: { modelProvider: 'groq', modelId: rateCard.modelId },
      approval: { approvalId: IDS.approval, planDigest: 'b'.repeat(64) }
    })
    const [sql, params] = query.mock.calls[0]!
    expect(sql).toMatch(/rate_revocation\.rate_card_id IS NULL/)
    expect(sql).toMatch(/approval_revocation\.approval_id IS NULL/)
    expect(params).toEqual([IDS.run, 'b'.repeat(64), IDS.rateCard, IDS.approval])
  })

  it('revokes pricing and approvals with separate append-only evidence', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ rate_card_id: IDS.rateCard }] })
      .mockResolvedValueOnce({ rows: [{ approval_id: IDS.approval }] })
    const store = createPostgresEvaluationApprovalStore({ query })

    await store.revokeRateCard({
      rateCardId: IDS.rateCard,
      revokedBy: IDS.actor,
      reason: 'Provider pricing evidence was superseded.'
    })
    await store.revokeApproval({
      approvalId: IDS.approval,
      revokedBy: IDS.actor,
      reason: 'Evaluation scope changed before execution.'
    })

    expect(query.mock.calls[0]?.[0]).toMatch(/INSERT INTO ai_eval_model_rate_card_revocations/)
    expect(query.mock.calls[1]?.[0]).toMatch(/INSERT INTO ai_eval_cost_approval_revocations/)
    expect(query.mock.calls.every(([sql]) => !/\bUPDATE\b|\bDELETE\b/i.test(String(sql)))).toBe(true)
  })

  it('trusts only exact stored artifacts when producing an execution envelope', () => {
    const approval = {
      approvalId: IDS.approval,
      planDigest: 'b'.repeat(64),
      approvedBy: IDS.actor,
      reason: 'Approved for the bounded evaluation suite.',
      maxSpendUsdMicros: 5_760,
      approvedAt: '2026-07-22T02:00:00.000Z',
      expiresAt: '2026-07-22T03:00:00.000Z'
    }
    const stored = createStoredEvaluationAdmissionDependencies({ rateCard, approval }, () => new Date('2026-07-22T02:30:00.000Z'))
    const request = {
      mode: 'model_simulation' as const,
      evaluationRunId: IDS.run,
      materialIdentity: {
        evaluationSuiteVersionId: '20000000-0000-4000-8000-000000000001',
        packVersionId: null,
        capabilityVersionId: '30000000-0000-4000-8000-000000000001',
        modelProvider: 'groq',
        modelId: rateCard.modelId,
        promptVersionDigest: 'c'.repeat(64),
        toolsetVersionDigest: 'd'.repeat(64)
      },
      caseCount: 3,
      availableTools: ['get_tasks'],
      budget: {
        maxCases: 3,
        maxInputTokensPerCase: 8_000,
        maxOutputTokensPerCase: 1_200,
        maxCostUsdMicrosPerCase: 40_000,
        maxLatencyMsPerCase: 20_000,
        maxTotalCostUsdMicros: 1_000_000,
        maxWallTimeMs: 60_000
      },
      rateCard: {
        modelProvider: rateCard.modelProvider,
        modelId: rateCard.modelId,
        inputUsdMicrosPerMillionTokens: rateCard.inputUsdMicrosPerMillionTokens,
        outputUsdMicrosPerMillionTokens: rateCard.outputUsdMicrosPerMillionTokens,
        sourceDigest: rateCard.sourceDigest,
        validFrom: rateCard.validFrom,
        validUntil: rateCard.validUntil
      }
    }
    const pending = planEvaluationExecution(request, stored)
    const exact = planEvaluationExecution({ ...request, approval: { ...approval, planDigest: pending.planDigest } },
      createStoredEvaluationAdmissionDependencies({
        rateCard,
        approval: { ...approval, planDigest: pending.planDigest }
      }, () => new Date('2026-07-22T02:30:00.000Z')))
    const tampered = planEvaluationExecution({
      ...request,
      approval: { ...approval, planDigest: pending.planDigest, maxSpendUsdMicros: 99_999 }
    }, createStoredEvaluationAdmissionDependencies({
      rateCard,
      approval: { ...approval, planDigest: pending.planDigest }
    }, () => new Date('2026-07-22T02:30:00.000Z')))

    expect(exact.decision).toBe('approved')
    expect(tampered).toMatchObject({ decision: 'rejected' })
    if (tampered.decision === 'rejected') {
      expect(tampered.issues).toContainEqual(expect.objectContaining({ code: 'approval_untrusted' }))
    }
  })
})
