import { beforeEach, describe, expect, it, vi } from 'vitest'

const ACTOR_ID = '10000000-0000-4000-8000-000000000001'
const OTHER_ACTOR_ID = '10000000-0000-4000-8000-000000000002'
const RUN_ID = '10000000-0000-4000-8000-000000000003'
const PACK_ID = '10000000-0000-4000-8000-000000000004'
const RATE_CARD_ID = '10000000-0000-4000-8000-000000000005'
const APPROVAL_ID = '10000000-0000-4000-8000-000000000006'
const DIGEST = 'a'.repeat(64)

const { createEvaluationIndexGetHandler } = await import(
  '~~/server/api/admin/ai/governance/evaluations/index.get'
)
const { createEvaluationIndexPostHandler } = await import(
  '~~/server/api/admin/ai/governance/evaluations/index.post'
)
const { createEvaluationGetHandler } = await import(
  '~~/server/api/admin/ai/governance/evaluations/[id].get'
)
const { createEvaluationApprovePostHandler } = await import(
  '~~/server/api/admin/ai/governance/evaluations/[id]/approve.post'
)
const { createEvaluationRunPostHandler } = await import(
  '~~/server/api/admin/ai/governance/evaluations/[id]/run.post'
)

const budget = {
  maxCases: 1,
  maxInputTokensPerCase: 100,
  maxOutputTokensPerCase: 20,
  maxCostUsdMicrosPerCase: 1_000,
  maxLatencyMsPerCase: 20,
  maxTotalCostUsdMicros: 1_000,
  maxWallTimeMs: 5_020
}

describe('admin AI governance evaluation APIs', () => {
  const requirePermission = vi.fn()
  const requireWriteAccess = vi.fn()
  const readBody = vi.fn()
  const getRouterParam = vi.fn()
  const setResponseHeader = vi.fn()
  const setResponseStatus = vi.fn()
  const listEvaluations = vi.fn()
  const getEvaluation = vi.fn()
  const preflightEvaluation = vi.fn()
  const approveEvaluationCost = vi.fn()
  const executeApprovedEvaluation = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    requirePermission.mockResolvedValue({ id: ACTOR_ID, role: 'admin' })
    requireWriteAccess.mockResolvedValue({ id: ACTOR_ID, role: 'admin' })
    getRouterParam.mockReturnValue(RUN_ID)
    listEvaluations.mockResolvedValue([])
    getEvaluation.mockResolvedValue({
      run: { id: RUN_ID, status: 'completed', gatePassed: true, createdBy: ACTOR_ID },
      results: [{ evaluationCaseId: 'fixture-case', outcome: 'pass' }]
    })
    preflightEvaluation.mockResolvedValue({
      evaluationRunId: RUN_ID,
      departmentId: OTHER_ACTOR_ID,
      planDigest: DIGEST,
      rateCardId: RATE_CARD_ID,
      estimatedUpperBoundUsdMicros: 27,
      maxModelCalls: 1,
      decision: 'requires_cost_approval'
    })
    approveEvaluationCost.mockResolvedValue({
      approvalId: APPROVAL_ID,
      evaluationRunId: RUN_ID,
      rateCardId: RATE_CARD_ID,
      planDigest: DIGEST,
      approvedBy: ACTOR_ID
    })
    executeApprovedEvaluation.mockResolvedValue({ id: RUN_ID, status: 'completed', gatePassed: true })
  })

  const event = () => ({ context: {} } as never)

  it.each([
    ['unauthenticated', 401],
    ['non-admin', 403]
  ])('rejects %s list access and does not inspect evaluations', async (_label, statusCode) => {
    requirePermission.mockRejectedValue(Object.assign(new Error('denied'), { statusCode }))
    const handler = createEvaluationIndexGetHandler({ requirePermission, setResponseHeader, listEvaluations })

    await expect(handler(event())).rejects.toMatchObject({ statusCode })
    expect(listEvaluations).not.toHaveBeenCalled()
  })

  it('returns uncached evaluation metadata to administrators', async () => {
    listEvaluations.mockResolvedValue([{ id: RUN_ID, status: 'running' }])
    const currentEvent = event()
    const handler = createEvaluationIndexGetHandler({ requirePermission, setResponseHeader, listEvaluations })

    await expect(handler(currentEvent)).resolves.toEqual({ items: [{ id: RUN_ID, status: 'running' }] })
    expect(requirePermission).toHaveBeenCalledWith(currentEvent, 'ADMIN')
    expect(setResponseHeader).toHaveBeenCalledWith(currentEvent, 'Cache-Control', 'private, no-store')
  })

  it('requires write access with the same session identity before preflight', async () => {
    requireWriteAccess.mockResolvedValue({ id: OTHER_ACTOR_ID, role: 'admin' })
    readBody.mockResolvedValue({
      packVersionId: PACK_ID,
      modelProvider: 'groq',
      modelId: 'openai/gpt-oss-120b',
      budget
    })
    const handler = createEvaluationIndexPostHandler({
      requirePermission, requireWriteAccess, readBody, setResponseHeader, setResponseStatus, preflightEvaluation
    })

    await expect(handler(event())).rejects.toMatchObject({ statusCode: 403 })
    expect(preflightEvaluation).not.toHaveBeenCalled()
  })

  it('rejects non-admin mutation access before checking write access', async () => {
    requirePermission.mockRejectedValue(Object.assign(new Error('forbidden'), { statusCode: 403 }))
    const handler = createEvaluationIndexPostHandler({
      requirePermission, requireWriteAccess, readBody, setResponseHeader, setResponseStatus, preflightEvaluation
    })

    await expect(handler(event())).rejects.toMatchObject({ statusCode: 403 })
    expect(requireWriteAccess).not.toHaveBeenCalled()
    expect(preflightEvaluation).not.toHaveBeenCalled()
  })

  it('uses the authenticated actor and rejects browser-supplied identity or material', async () => {
    const handler = createEvaluationIndexPostHandler({
      requirePermission, requireWriteAccess, readBody, setResponseHeader, setResponseStatus, preflightEvaluation
    })
    readBody.mockResolvedValue({
      packVersionId: PACK_ID,
      modelProvider: 'groq',
      modelId: 'openai/gpt-oss-120b',
      budget
    })
    const currentEvent = event()

    await handler(currentEvent)
    expect(preflightEvaluation).toHaveBeenCalledWith({
      packVersionId: PACK_ID,
      modelProvider: 'groq',
      modelId: 'openai/gpt-oss-120b',
      budget
    }, ACTOR_ID)
    expect(setResponseStatus).toHaveBeenCalledWith(currentEvent, 201)

    for (const forbidden of [
      { actorId: OTHER_ACTOR_ID },
      { prompt: 'browser prompt' },
      { cases: [] },
      { availableTools: ['delete_everything'] },
      { scopeFixture: { live: true } },
      { inputPricePerMillionUsd: 0 }
    ]) {
      vi.clearAllMocks()
      requirePermission.mockResolvedValue({ id: ACTOR_ID, role: 'admin' })
      requireWriteAccess.mockResolvedValue({ id: ACTOR_ID, role: 'admin' })
      readBody.mockResolvedValue({
        packVersionId: PACK_ID,
        modelProvider: 'groq',
        modelId: 'openai/gpt-oss-120b',
        budget,
        ...forbidden
      })
      await expect(handler(event())).rejects.toMatchObject({ statusCode: 422 })
      expect(preflightEvaluation).not.toHaveBeenCalled()
    }
  })

  it('strictly validates approval bodies and binds the route run ID', async () => {
    const handler = createEvaluationApprovePostHandler({
      requirePermission, requireWriteAccess, readBody, getRouterParam,
      setResponseHeader, setResponseStatus, approveEvaluationCost
    })
    readBody.mockResolvedValue({
      planDigest: DIGEST,
      maxSpendUsdMicros: 27,
      expiresAt: '2026-08-03T03:00:00.000Z',
      reason: 'Approve the exact bounded evaluation.',
      prompt: 'must not be accepted'
    })

    await expect(handler(event())).rejects.toMatchObject({ statusCode: 422 })
    expect(approveEvaluationCost).not.toHaveBeenCalled()
  })

  it('run accepts only stored artifact IDs and digests', async () => {
    const handler = createEvaluationRunPostHandler({
      requirePermission, requireWriteAccess, readBody, getRouterParam,
      setResponseHeader, executeApprovedEvaluation
    })
    const exact = { planDigest: DIGEST, rateCardId: RATE_CARD_ID, approvalId: APPROVAL_ID }
    readBody.mockResolvedValue(exact)

    await handler(event())
    expect(executeApprovedEvaluation).toHaveBeenCalledWith({ evaluationRunId: RUN_ID, ...exact }, ACTOR_ID, expect.anything())

    for (const forbidden of ['prompt', 'cases', 'tools', 'prices', 'scopeFixture']) {
      vi.clearAllMocks()
      requirePermission.mockResolvedValue({ id: ACTOR_ID, role: 'admin' })
      requireWriteAccess.mockResolvedValue({ id: ACTOR_ID, role: 'admin' })
      getRouterParam.mockReturnValue(RUN_ID)
      readBody.mockResolvedValue({ ...exact, [forbidden]: forbidden === 'prompt' ? 'browser prompt' : {} })
      await expect(handler(event())).rejects.toMatchObject({ statusCode: 422 })
      expect(executeApprovedEvaluation).not.toHaveBeenCalled()
    }
  })

  it('maps duplicate execution to a sanitized conflict', async () => {
    executeApprovedEvaluation.mockRejectedValue(Object.assign(
      new Error('internal approval row and provider details'),
      { name: 'EvaluationOrchestrationError', code: 'evaluation_run_already_terminal', statusCode: 409 }
    ))
    readBody.mockResolvedValue({ planDigest: DIGEST, rateCardId: RATE_CARD_ID, approvalId: APPROVAL_ID })
    const handler = createEvaluationRunPostHandler({
      requirePermission, requireWriteAccess, readBody, getRouterParam,
      setResponseHeader, executeApprovedEvaluation
    })

    const failure = await handler(event()).catch((error: any) => error)
    expect(failure).toMatchObject({ statusCode: 409, data: { code: 'evaluation_run_already_terminal' } })
    expect(JSON.stringify(failure)).not.toContain('internal approval row')
    expect(JSON.stringify(failure)).not.toContain('provider details')
  })

  it('sanitizes unexpected service failures', async () => {
    listEvaluations.mockRejectedValue(new Error('DATABASE_URL and secret prompt leaked'))
    const handler = createEvaluationIndexGetHandler({ requirePermission, setResponseHeader, listEvaluations })

    const failure = await handler(event()).catch((error: any) => error)
    expect(failure).toMatchObject({ statusCode: 500, data: { code: 'evaluation_list_failed' } })
    expect(JSON.stringify(failure)).not.toContain('DATABASE_URL')
    expect(JSON.stringify(failure)).not.toContain('secret prompt')
  })

  it('returns idempotent uncached terminal reads without rerunning evaluation', async () => {
    const handler = createEvaluationGetHandler({ requirePermission, getRouterParam, setResponseHeader, getEvaluation })
    const currentEvent = event()

    const first = await handler(currentEvent)
    const second = await handler(currentEvent)
    expect(second).toEqual(first)
    expect(getEvaluation).toHaveBeenCalledTimes(2)
    expect(executeApprovedEvaluation).not.toHaveBeenCalled()
    expect(setResponseHeader).toHaveBeenCalledWith(currentEvent, 'Cache-Control', 'private, no-store')
  })
})
