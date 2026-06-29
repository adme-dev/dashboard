import { beforeEach, describe, it, expect, vi } from 'vitest'
import { decideExecution, type ExecutionContext } from '~~/server/utils/budgetExecution'

const mockRequireRole = vi.fn()
const mockQueryOne = vi.fn()
const mockExecute = vi.fn()
const mockGetSelectedTenant = vi.fn()
const mockGetSocialBudgetControlConfig = vi.fn()
const mockClaimApprovedAction = vi.fn()
const mockReleaseActionClaim = vi.fn()
const mockResolveMetaBudgetTarget = vi.fn()
const mockUpdateMetaDailyBudget = vi.fn()
const mockUpdateGoogleCampaignDailyBudget = vi.fn()
const mockResolveGoogleWriteAuth = vi.fn()
const mockKvDelete = vi.fn()
const mockResolveGoogleAdsRuntimeConfig = vi.fn()
let mockBody: Record<string, unknown> = {}

vi.mock('~~/server/utils/auth', () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}))

vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args),
  execute: (...args: unknown[]) => mockExecute(...args),
}))

vi.mock('~~/server/utils/session', () => ({
  getSelectedTenant: (...args: unknown[]) => mockGetSelectedTenant(...args),
}))

vi.mock('~~/server/utils/socialBudgetControlConfig', () => ({
  getSocialBudgetControlConfig: (...args: unknown[]) => mockGetSocialBudgetControlConfig(...args),
}))

vi.mock('~~/server/utils/metaClient', () => ({
  resolveMetaBudgetTarget: (...args: unknown[]) => mockResolveMetaBudgetTarget(...args),
  updateMetaDailyBudget: (...args: unknown[]) => mockUpdateMetaDailyBudget(...args),
}))

vi.mock('~~/server/utils/googleAdsClient', () => ({
  updateGoogleCampaignDailyBudget: (...args: unknown[]) => mockUpdateGoogleCampaignDailyBudget(...args),
  refreshGoogleToken: vi.fn(),
  listAccessibleCustomers: vi.fn(),
}))

vi.mock('~~/server/utils/googleWriteAuth', () => ({
  resolveGoogleWriteAuth: (...args: unknown[]) => mockResolveGoogleWriteAuth(...args),
}))

vi.mock('~~/server/utils/campaignActionClaim', () => ({
  claimApprovedAction: (...args: unknown[]) => mockClaimApprovedAction(...args),
  releaseActionClaim: (...args: unknown[]) => mockReleaseActionClaim(...args),
}))

vi.mock('~~/server/utils/kv', () => ({
  kvDelete: (...args: unknown[]) => mockKvDelete(...args),
}))

vi.mock('~~/server/utils/spendSync', () => ({
  resolveGoogleAdsRuntimeConfig: (...args: unknown[]) => mockResolveGoogleAdsRuntimeConfig(...args),
}))

;(globalThis as any).eventHandler = (fn: any) => fn
;(globalThis as any).getRouterParam = (event: any, key: string) => event.params?.[key]
;(globalThis as any).readBody = () => Promise.resolve(mockBody)
;(globalThis as any).createError = (input: { statusCode: number, statusMessage: string }) => Object.assign(new Error(input.statusMessage), input)

const ctx: ExecutionContext = {
  platform: 'meta',
  flagEnabled: true,
  currentDaily: 100,
  recommendedDaily: 200,
  platformMinimum: 5,
  maxMultiple: 2,
  monthlyBudget: 0, mtdSpend: 0, monthDaysRemaining: 15, monthlyMarginPct: 0.1,
  alreadyAppliedToday: false,
  override: false,
}

describe('decideExecution', () => {
  it('rejects when the platform flag is off', () => {
    const d = decideExecution({ ...ctx, flagEnabled: false })
    expect(d.proceed).toBe(false)
    expect(d.reason).toBe('writes_disabled')
  })
  it('clamps +100% to +20% and proceeds', () => {
    const d = decideExecution(ctx)
    expect(d.proceed).toBe(true)
    expect(d.finalDaily).toBe(120)
    expect(d.clamped).toBe(true)
  })
  it('does not proceed when blocked by rate limit', () => {
    const d = decideExecution({ ...ctx, alreadyAppliedToday: true })
    expect(d.proceed).toBe(false)
    expect(d.reason).toBe('rate_limited_today')
  })
})

describe('POST /api/agency/social/spend/:id/actions/:actionId/execute', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockBody = {}
    mockRequireRole.mockResolvedValue({ id: 'admin-1' })
    mockGetSelectedTenant.mockResolvedValue('tenant-1')
    mockGetSocialBudgetControlConfig.mockResolvedValue({
      liveBudgetChangesEnabled: true,
      metaBudgetWritesEnabled: true,
      googleBudgetWritesEnabled: true,
      maxMultiple: 2,
      monthlyMarginPct: 0.1,
    })
  })

  it('returns an already_executing block instead of 404 when another apply has already claimed the action', async () => {
    mockQueryOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ action_status: 'executing' })

    const handler = (await import('~~/server/api/agency/social/spend/[id]/actions/[actionId]/execute.post')).default

    const result = await handler({ params: { id: 'spend-1', actionId: 'action-1' } } as any)

    expect(result).toEqual({ status: 'blocked', reason: 'already_executing', clampReasons: [] })
    expect(mockClaimApprovedAction).not.toHaveBeenCalled()
    expect(mockResolveMetaBudgetTarget).not.toHaveBeenCalled()
    expect(mockUpdateGoogleCampaignDailyBudget).not.toHaveBeenCalled()
  })

  it('returns an already_applied block instead of 404 when a duplicate apply follows a completed action', async () => {
    mockQueryOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ action_status: 'applied' })

    const handler = (await import('~~/server/api/agency/social/spend/[id]/actions/[actionId]/execute.post')).default

    const result = await handler({ params: { id: 'spend-1', actionId: 'action-1' } } as any)

    expect(result).toEqual({ status: 'blocked', reason: 'already_applied', clampReasons: [] })
    expect(mockClaimApprovedAction).not.toHaveBeenCalled()
    expect(mockResolveMetaBudgetTarget).not.toHaveBeenCalled()
    expect(mockUpdateGoogleCampaignDailyBudget).not.toHaveBeenCalled()
  })
})
