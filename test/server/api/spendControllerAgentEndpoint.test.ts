import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockRequireAuth = vi.fn()
const mockQueryRows = vi.fn()
const mockStartRun = vi.fn()
const mockCompleteRun = vi.fn()
const mockFailRun = vi.fn()

vi.mock('~~/server/utils/auth', () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
}))

vi.mock('~~/server/utils/db', () => ({
  queryRows: (...args: unknown[]) => mockQueryRows(...args),
}))

vi.mock('~~/server/utils/ai/platformAgentRuns', () => ({
  startPlatformAgentRun: (...args: unknown[]) => mockStartRun(...args),
  completePlatformAgentRun: (...args: unknown[]) => mockCompleteRun(...args),
  failPlatformAgentRun: (...args: unknown[]) => mockFailRun(...args),
}))

;(globalThis as any).defineEventHandler = (fn: any) => fn
;(globalThis as any).readBody = (event: any) => event.body || {}
;(globalThis as any).createError = (input: any) => {
  const error = new Error(input.statusMessage || 'error') as Error & { statusCode?: number, statusMessage?: string }
  error.statusCode = input.statusCode
  error.statusMessage = input.statusMessage
  return error
}

describe('POST /api/agency/agents/spend-controller/ask', () => {
  const oldEnv = { ...process.env }

  beforeEach(() => {
    process.env = { ...oldEnv, SPEND_CONTROLLER_AGENT_ENABLED: 'true' }
    vi.resetModules()
    mockRequireAuth.mockReset()
    mockQueryRows.mockReset()
    mockStartRun.mockReset()
    mockCompleteRun.mockReset()
    mockFailRun.mockReset()
    mockRequireAuth.mockResolvedValue({ id: '11111111-1111-4111-8111-111111111111' })
    mockStartRun.mockResolvedValue({ ok: true, runId: 'run-1' })
    mockCompleteRun.mockResolvedValue(undefined)
    mockFailRun.mockResolvedValue(undefined)
    mockQueryRows.mockResolvedValue([
      {
        media_spend_id: 'spend-1',
        client_name: 'Acme',
        platform: 'meta',
        campaign_id: 'camp-1',
        campaign_name: 'Lead Gen',
        campaign_status: 'ACTIVE',
        budget_allocated: '3000',
        actual_spend: '2400',
        impressions: '10000',
        clicks: '500',
        conversions: '4',
        reach: '7500',
        frequency: '1.33',
        impression_share: null,
        lost_impression_share_budget: null,
        lost_impression_share_rank: null,
        bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
        budget_type: 'daily',
        period: '2026-06',
        synced_at: '2026-06-26T00:00:00.000Z',
        end_date: null,
      },
    ])
  })

  it('requires auth, builds a read-only spend response, and records the run', async () => {
    const handler = (await import('~~/server/api/agency/agents/spend-controller/ask.post')).default

    const result = await handler({
      body: {
        prompt: 'What needs attention?',
        context: { period: '2026-06', platform: 'meta' },
      },
    } as any)

    expect(mockRequireAuth).toHaveBeenCalled()
    expect(mockQueryRows.mock.calls[0]?.[1]).toEqual(['2026-06', 'meta'])
    expect(mockStartRun).toHaveBeenCalledWith(expect.objectContaining({
      agentType: 'spend_controller',
      featureKey: 'agent_spend_controller',
      mode: 'read_only',
      route: '/agency/social/spend',
      prompt: 'What needs attention?',
      context: { period: '2026-06', platform: 'meta' },
    }))
    expect(mockCompleteRun).toHaveBeenCalledWith(expect.objectContaining({
      runId: 'run-1',
      toolCallCount: 1,
      findingCount: result.findings.length,
      proposedActionCount: 0,
      blockedActionCount: 0,
    }))
    expect(result).toMatchObject({
      runId: 'run-1',
      mode: 'read_only',
      audit: {
        modelFeatureKey: 'agent_spend_controller',
        toolCallCount: 1,
      },
    })
    expect(result.proposedActions).toEqual([])
  })

  it('is disabled by default unless the feature flag is enabled', async () => {
    process.env = { ...oldEnv, SPEND_CONTROLLER_AGENT_ENABLED: 'false' }
    vi.resetModules()
    const handler = (await import('~~/server/api/agency/agents/spend-controller/ask.post')).default

    await expect(handler({ body: { prompt: 'What needs attention?' } } as any)).rejects.toMatchObject({
      statusCode: 404,
    })
  })
})
