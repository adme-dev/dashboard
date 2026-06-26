import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockRequireAuth = vi.fn()
const mockGetSelectedTenant = vi.fn()
const mockQueryRows = vi.fn()
const mockStartRun = vi.fn()
const mockCompleteRun = vi.fn()
const mockFailRun = vi.fn()

vi.mock('~~/server/utils/auth', () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
}))

vi.mock('~~/server/utils/session', () => ({
  getSelectedTenant: (...args: unknown[]) => mockGetSelectedTenant(...args),
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
;(globalThis as any).getHeader = (event: any, name: string) => event.headers?.[name.toLowerCase()] ?? event.headers?.[name]
;(globalThis as any).createError = (input: any) => Object.assign(new Error(input.statusMessage || 'error'), input)

describe('Financial Watch Agent endpoints', () => {
  const oldEnv = { ...process.env }

  beforeEach(() => {
    process.env = {
      ...oldEnv,
      FINANCIAL_WATCH_AGENT_ENABLED: 'true',
      INTERNAL_API_KEY: 'secret-key',
    }
    vi.resetModules()
    mockRequireAuth.mockReset()
    mockGetSelectedTenant.mockReset()
    mockQueryRows.mockReset()
    mockStartRun.mockReset()
    mockCompleteRun.mockReset()
    mockFailRun.mockReset()
    mockRequireAuth.mockResolvedValue({ id: 'user-1' })
    mockGetSelectedTenant.mockResolvedValue('tenant-1')
    mockStartRun.mockResolvedValue({ ok: true, runId: 'run-1' })
    mockCompleteRun.mockResolvedValue(undefined)
    mockFailRun.mockResolvedValue(undefined)
    mockQueryRows
      .mockResolvedValueOnce([{
        id: 'report-1',
        period_key: '2026-06-26',
        period_label: 'June 2026',
        grade: 'C',
        score: 58,
        headline: 'Cash pressure rising',
        verdict: 'Collections need attention.',
        payload: {
          alerts: [{ level: 'warning', message: 'Overdue AR is elevated.' }],
          risks: [{ title: 'Collections', severity: 'high' }],
        },
        generated_at: '2026-06-26T00:00:00.000Z',
      }])
      .mockResolvedValueOnce([{
        id: 'rec-1',
        title: 'Tighten collections',
        action: 'Call overdue accounts',
        impact: '$10k cash acceleration',
        priority: 'high',
        status: 'open',
        target_metric: 'overdueAmount',
        target_direction: 'down',
        due_date: null,
        created_at: '2026-06-26T00:00:00.000Z',
      }])
      .mockResolvedValueOnce([{
        id: 'alert-1',
        alert_type: 'forecast_overrun',
        severity: 'critical',
        status: 'active',
        message: 'Budget forecast overrun.',
        budget_amount: '1000',
        actual_amount: '1400',
        variance_amount: '400',
        created_at: '2026-06-26T00:00:00.000Z',
      }])
  })

  it('requires auth, reads stored finance signals, and records a platform-agent run', async () => {
    const handler = (await import('~~/server/api/agency/agents/financial-watch/ask.post')).default

    const result = await handler({
      body: { prompt: 'Review finance risk.', context: { clientId: 'client-1' } },
    } as any)

    expect(mockRequireAuth).toHaveBeenCalled()
    expect(mockGetSelectedTenant).toHaveBeenCalled()
    expect(mockQueryRows).toHaveBeenCalledTimes(3)
    expect(mockStartRun).toHaveBeenCalledWith(expect.objectContaining({
      agentType: 'financial_watch',
      featureKey: 'agent_financial_watch',
      mode: 'read_only',
      clientId: 'client-1',
      context: {
        tenantId: 'tenant-1',
        clientId: 'client-1',
      },
    }))
    expect(mockCompleteRun).toHaveBeenCalledWith(expect.objectContaining({
      runId: 'run-1',
      toolCallCount: 3,
      proposedActionCount: 0,
    }))
    expect(result).toMatchObject({
      runId: 'run-1',
      mode: 'read_only',
      summary: {
        latestReport: { grade: 'C', score: 58 },
        activeRecommendationCount: 1,
        highPriorityRecommendationCount: 1,
        activeBudgetAlertCount: 1,
        criticalBudgetAlertCount: 1,
      },
    })
    expect(result.findings.map((finding: any) => finding.title)).toContain('Latest advisor grade C')
    expect(result.alerts.map((alert: any) => alert.message)).toContain('Overdue AR is elevated.')
  })

  it('allows the internal bridge with INTERNAL_API_KEY and blocks direct write actions', async () => {
    const handler = (await import('~~/server/api/internal/platform-agents/financial-watch/ask.post')).default

    const result = await handler({
      headers: { authorization: 'Bearer secret-key' },
      body: { prompt: 'Review finance risk.', context: { tenantId: 'tenant-1' } },
    } as any)

    expect(result.mode).toBe('read_only')
    expect(mockRequireAuth).not.toHaveBeenCalled()

    await expect(handler({
      headers: { authorization: 'Bearer secret-key' },
      body: { prompt: 'Write finance changes.', draftActions: true, context: { tenantId: 'tenant-1' } },
    } as any)).rejects.toMatchObject({ statusCode: 403 })
  })

  it('rejects disabled or unscoped requests', async () => {
    process.env = { ...oldEnv, FINANCIAL_WATCH_AGENT_ENABLED: 'false' }
    vi.resetModules()
    const handler = (await import('~~/server/api/agency/agents/financial-watch/ask.post')).default

    await expect(handler({ body: { prompt: 'Review finance risk.' } } as any))
      .rejects.toMatchObject({ statusCode: 404 })

    process.env = { ...oldEnv, FINANCIAL_WATCH_AGENT_ENABLED: 'true' }
    vi.resetModules()
    mockGetSelectedTenant.mockResolvedValueOnce(null)
    const enabledHandler = (await import('~~/server/api/agency/agents/financial-watch/ask.post')).default
    await expect(enabledHandler({ body: { prompt: 'Review finance risk.' } } as any))
      .rejects.toMatchObject({ statusCode: 400 })
  })
})
