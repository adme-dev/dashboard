import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockRequireWriteAccess = vi.fn()
const mockQueryOne = vi.fn()

vi.mock('~~/server/utils/auth', () => ({
  requireWriteAccess: (...args: unknown[]) => mockRequireWriteAccess(...args),
}))

vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args),
}))

;(globalThis as any).eventHandler = (fn: any) => fn
;(globalThis as any).getRouterParam = (event: any, key: string) => event.params?.[key]
;(globalThis as any).readBody = (event: any) => event.body || {}
;(globalThis as any).createError = (input: { statusCode: number, statusMessage: string }) => Object.assign(new Error(input.statusMessage), input)

describe('POST /api/agency/agents/spend-controller/proposals/:actionId/decision', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireWriteAccess.mockResolvedValue({ id: 'user-1' })
    mockQueryOne.mockResolvedValue({
      id: 'action-1',
      metadata: {
        source: 'spend_controller_agent',
        proposalDecision: 'ignored',
      },
    })
  })

  it('records an ignored decision on planned Spend Controller proposals only', async () => {
    const handler = (await import('~~/server/api/agency/agents/spend-controller/proposals/[actionId]/decision.post')).default

    const result = await handler({
      params: { actionId: 'action-1' },
      body: { decision: 'ignored', note: 'Not needed after client update.' },
    } as any)

    const sql = String(mockQueryOne.mock.calls[0][0])
    expect(mockRequireWriteAccess).toHaveBeenCalled()
    expect(sql).toContain("metadata->>'source' = 'spend_controller_agent'")
    expect(sql).toContain("action_status = 'planned'")
    expect(sql).toContain("'proposalDecision', $2::text")
    expect(sql).toContain("'proposalDecidedBy', $3::text")
    expect(sql).toContain("'proposalDecidedAt', NOW()::text")
    expect(mockQueryOne.mock.calls[0][1]).toEqual([
      'action-1',
      'ignored',
      'user-1',
      'Not needed after client update.',
      null,
    ])
    expect(result).toMatchObject({ ok: true, actionId: 'action-1', decision: 'ignored' })
  })

  it('records an edited decision with the replacement action id', async () => {
    const handler = (await import('~~/server/api/agency/agents/spend-controller/proposals/[actionId]/decision.post')).default

    await handler({
      params: { actionId: 'action-1' },
      body: { decision: 'edited', editedActionId: 'action-2' },
    } as any)

    expect(mockQueryOne.mock.calls[0][1]).toEqual([
      'action-1',
      'edited',
      'user-1',
      null,
      'action-2',
    ])
  })

  it('rejects invalid decisions and unknown proposal rows', async () => {
    const handler = (await import('~~/server/api/agency/agents/spend-controller/proposals/[actionId]/decision.post')).default

    await expect(handler({
      params: { actionId: 'action-1' },
      body: { decision: 'accepted' },
    } as any)).rejects.toMatchObject({ statusCode: 400 })

    mockQueryOne.mockResolvedValueOnce(null)
    await expect(handler({
      params: { actionId: 'action-1' },
      body: { decision: 'ignored' },
    } as any)).rejects.toMatchObject({ statusCode: 404 })
  })
})
