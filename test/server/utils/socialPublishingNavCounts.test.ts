import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockQueryOne = vi.fn()

vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args),
}))

describe('getSocialPublishingNavCounts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the four nav-badge counts scoped to a client', async () => {
    mockQueryOne.mockResolvedValue({ accounts: 5, scheduled: 3, pendingApprovals: 2, drafts: 7 })
    const { getSocialPublishingNavCounts } = await import('~~/server/utils/socialPublishingNavCounts')

    await expect(getSocialPublishingNavCounts('client-1')).resolves.toEqual({
      accounts: 5,
      scheduled: 3,
      pendingApprovals: 2,
      drafts: 7,
    })

    expect(mockQueryOne.mock.calls[0][1]).toEqual(['client-1'])
    const sql = String(mockQueryOne.mock.calls[0][0])
    expect(sql).toContain('social_accounts')
    expect(sql).toContain('social_posts')
    expect(sql).toContain('is_active')
    expect(sql).toContain("status = 'scheduled'")
    expect(sql).toContain("status = 'draft'")
    // pending-approval predicate mirrors approvals/badge.get.ts
    expect(sql).toContain('approval_requested_at IS NOT NULL')
    expect(sql).toContain('approved_at IS NULL')
  })

  it('coerces missing/partial count columns to zero', async () => {
    mockQueryOne.mockResolvedValue({ accounts: 4 })
    const { getSocialPublishingNavCounts } = await import('~~/server/utils/socialPublishingNavCounts')

    await expect(getSocialPublishingNavCounts('client-1')).resolves.toEqual({
      accounts: 4,
      scheduled: 0,
      pendingApprovals: 0,
      drafts: 0,
    })
  })

  it('passes null when no client is given (counts across all clients)', async () => {
    mockQueryOne.mockResolvedValue(null)
    const { getSocialPublishingNavCounts } = await import('~~/server/utils/socialPublishingNavCounts')

    await expect(getSocialPublishingNavCounts()).resolves.toEqual({
      accounts: 0,
      scheduled: 0,
      pendingApprovals: 0,
      drafts: 0,
    })
    expect(mockQueryOne.mock.calls[0][1]).toEqual([null])
  })
})
