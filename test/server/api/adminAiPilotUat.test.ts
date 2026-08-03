import { beforeEach, describe, expect, it, vi } from 'vitest'

const { createPilotUatPostHandler } = await import('~~/server/api/admin/ai/governance/pilot-uat.post')
const { createPilotUatAssessmentPostHandler } = await import('~~/server/api/admin/ai/governance/pilot-uat/[id]/assessment.post')

const UUID = '10000000-0000-4000-8000-000000000001'

describe('controlled pilot UAT routes', () => {
  const requirePermission = vi.fn()
  const requireWriteAccess = vi.fn()
  const readBody = vi.fn()
  const runUat = vi.fn()
  const assess = vi.fn()
  const setResponseHeader = vi.fn()
  const getRouterParam = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    requirePermission.mockResolvedValue({ id: UUID, role: 'admin' })
    requireWriteAccess.mockResolvedValue({ id: UUID, role: 'admin' })
    readBody.mockResolvedValue({ requestId: UUID, releaseId: UUID, evaluationCaseId: UUID, actorUserId: UUID, conversationId: UUID })
    runUat.mockResolvedValue({ evidenceId: UUID, state: 'terminal', terminalOutcome: 'success' })
    getRouterParam.mockReturnValue(UUID)
  })

  it('requires matching ADMIN/write identity, an enabled harness, and a strict IDs-only body', async () => {
    const handler = createPilotUatPostHandler({ requirePermission, requireWriteAccess, readBody, runUat, setResponseHeader, harnessEnabled: () => true })
    await handler({ context: {} } as never)
    expect(runUat).toHaveBeenCalledWith(expect.objectContaining({ issuerUserId: UUID, reason: 'Controlled pilot UAT harness' }), expect.anything())

    readBody.mockResolvedValueOnce({ requestId: UUID, releaseId: UUID, evaluationCaseId: UUID, actorUserId: UUID, conversationId: UUID, prompt: 'forged' })
    await expect(handler({ context: {} } as never)).rejects.toMatchObject({ statusCode: 422 })

    const disabled = createPilotUatPostHandler({ requirePermission, requireWriteAccess, readBody, runUat, setResponseHeader, harnessEnabled: () => false })
    await expect(disabled({ context: {} } as never)).rejects.toMatchObject({ statusCode: 503, data: { code: 'representative_evidence_caller_unavailable' } })
  })

  it('requires an independent assessor and all six prompt-free dimensions', async () => {
    const handler = createPilotUatAssessmentPostHandler({ requirePermission, requireWriteAccess, readBody, assess, setResponseHeader, getRouterParam })
    readBody.mockResolvedValue({ reason: 'Independent evidence review', scopeRespected: true, approvalBoundaryRespected: true, prohibitedEffectObserved: false, freshnessRespected: true, fabricationObserved: false, credentialLeakObserved: false })
    assess.mockResolvedValue({ evidenceId: UUID, state: 'assessed' })
    await handler({ context: {} } as never)
    expect(assess).toHaveBeenCalledWith(expect.objectContaining({ evidenceId: UUID, assessorUserId: UUID }))

    readBody.mockResolvedValueOnce({ reason: 'Incomplete review', scopeRespected: true })
    await expect(handler({ context: {} } as never)).rejects.toMatchObject({ statusCode: 422 })
  })
})
