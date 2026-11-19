/* eslint-disable @typescript-eslint/no-explicit-any -- partial plan and DB fixtures */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ queryOne: vi.fn(), query: vi.fn(), getPlan: vi.fn(), reviewer: vi.fn(), capability: vi.fn(), connection: vi.fn(), execute: vi.fn(), staff: vi.fn() }))
vi.mock('~~/server/utils/db', () => ({
  queryOneFresh: m.queryOne,
  queryRowsFresh: vi.fn(),
  transaction: async (fn: any) => fn({ query: m.query })
}))
vi.mock('~~/server/utils/ai/marketing/reviewAuthority', () => ({ requireIndependentMarketingReviewer: m.reviewer, assertMarketingCapabilityAtBoundary: m.capability }))
vi.mock('~~/server/utils/ai/marketing/googleAdsAccess', () => ({ assertGoogleAdsConnection: m.connection }))
vi.mock('~~/server/utils/googleAds/actionStore', () => ({ getGoogleAdsActionPlan: m.getPlan }))
vi.mock('~~/server/utils/googleAds/searchRuntime', () => ({ executeSearchGoogleAdsControlAction: m.execute }))
vi.mock('~~/server/utils/ai/mcp/runtimeConfig', () => ({ resolveMcpRuntimeConfig: () => ({ suiteFlags: { googleAdsRead: true, googleAdsWrite: true } }) }))
vi.mock('~~/server/utils/ai/mcp/staffAuthority', () => ({ resolveMcpStaffContext: m.staff }))

const { reviewGoogleAdsPlan, executeReviewedGoogleAdsPlan } = await import('~~/server/utils/googleAds/staffReview')

const planId = '11111111-1111-4111-8111-111111111111'
const clientId = '22222222-2222-4222-8222-222222222222'
const requester = '33333333-3333-4333-8333-333333333333'
const manager = '44444444-4444-4444-8444-444444444444'
const hash = 'a'.repeat(64)
let plan: any

beforeEach(() => {
  vi.clearAllMocks()
  plan = { id: planId, clientId, actorId: requester, connectionId: 'c', customerId: '1', operation: 'add_negative_keywords', requestHash: hash, reviewPolicy: 'delegated_marketing', status: 'pending_approval', reviewedBy: null, expiresAt: '2099-01-01T00:00:00Z' }
  m.queryOne.mockResolvedValue({ client_id: clientId })
  m.getPlan.mockImplementation(async () => plan)
  m.reviewer.mockResolvedValue({ id: manager, role: 'account_manager', name: null, groups: ['MARKETING_MANAGEMENT'] })
  m.capability.mockResolvedValue({})
  m.connection.mockResolvedValue(undefined)
  m.query.mockResolvedValue({ rows: [{ id: planId }] })
  m.staff.mockResolvedValue({ userRole: 'account_manager', permissionGroups: ['MARKETING_MANAGEMENT'], mcpStaffAuthority: 'fresh' })
  m.execute.mockResolvedValue({ ok: true })
})

const approve = () => reviewGoogleAdsPlan({} as any, manager, { actionPlanId: planId, expectedRequestHash: hash, decision: 'approved' })

describe('delegated Google Ads review — governance risk tiers', () => {
  it('keeps existing low/medium delegated approvals working for a marketing manager', async () => {
    await expect(approve()).resolves.toBeTruthy()
    plan.operation = 'update_budget'
    await expect(approve()).resolves.toBeTruthy()
    expect(m.query.mock.calls.filter(([sql]) => sql.includes('UPDATE google_ads_action_plans'))).toHaveLength(2)
  })

  it('high-risk operations need the owner: a marketing manager approval is refused before any write', async () => {
    plan.operation = 'remove_campaign'
    await expect(approve()).rejects.toMatchObject({ statusCode: 403, statusMessage: 'ADS_TIER_OWNER_REQUIRED' })
    expect(m.query).not.toHaveBeenCalled()
    m.reviewer.mockResolvedValue({ id: manager, role: 'owner', name: null, groups: ['ADMIN'] })
    await expect(approve()).resolves.toBeTruthy()
  })

  it('rejection never needs elevated authority', async () => {
    plan.operation = 'remove_conversion_action'
    await expect(reviewGoogleAdsPlan({} as any, manager, { actionPlanId: planId, expectedRequestHash: hash, decision: 'rejected' })).resolves.toBeTruthy()
  })

  it('execution re-checks the recorded reviewer against the tier', async () => {
    plan = { ...plan, operation: 'remove_campaign', status: 'approved', reviewedBy: manager }
    await expect(executeReviewedGoogleAdsPlan({} as any, manager, { actionPlanId: planId, expectedRequestHash: hash })).rejects.toMatchObject({ statusMessage: 'ADS_TIER_OWNER_REQUIRED' })
    expect(m.execute).not.toHaveBeenCalled()
    plan.operation = 'pause_campaign'
    await expect(executeReviewedGoogleAdsPlan({} as any, manager, { actionPlanId: planId, expectedRequestHash: hash })).resolves.toEqual({ ok: true })
  })
})
