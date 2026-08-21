import { describe, expect, it, vi } from 'vitest'
import { checkPacing, type CheckPacingDeps } from '~~/server/utils/ai/tools/checkPacing'
import type { ToolContext } from '~~/server/utils/ai/toolContext'

const ctx = { userId: 'u1', userRole: 'owner', event: {} as any } as ToolContext

// One heavily over-pacing row so the review emits an actionable item.
function row(over: Record<string, unknown> = {}) {
  return {
    media_spend_id: 'ms1', client_id: 'c1', client_name: 'Acme', campaign_id: 'cmp1', campaign_name: 'Prospecting',
    platform: 'meta', campaign_status: 'ACTIVE', budget_allocated: 1000, actual_spend: 950, impressions: 1000, clicks: 50,
    conversions: 2, reach: null, frequency: null, impression_share: null, lost_impression_share_budget: null,
    lost_impression_share_rank: null, bid_strategy: null, budget_type: null, period: '2026-08',
    synced_at: '2026-08-18T08:00:00Z', end_date: null,
    ...over,
  } as any
}

describe('check_pacing', () => {
  it('returns items with a declared cap when the sync is inside the window', async () => {
    const deps: CheckPacingDeps = {
      now: () => new Date('2026-08-19T06:00:00Z'),
      load: vi.fn().mockResolvedValue([row()]),
      loadCoverageDeltas: async () => null,
    }
    const data = ((await checkPacing({}, ctx, deps)) as any).data
    expect(data.halted).toBe(false)
    expect(data.limit).toBe(25)
    expect(data.more).toBe(0)
    expect(data.count).toBe(data.items.length)
    expect(data.lastSyncedAt).toBe('2026-08-18T08:00:00Z')
  })

  it('halts with no items before the newest sync reaches 24h old (P-02)', async () => {
    const deps: CheckPacingDeps = {
      now: () => new Date('2026-08-19T10:01:00Z'),
      load: vi.fn().mockResolvedValue([row()]),
      loadCoverageDeltas: async () => null,
    }
    const data = ((await checkPacing({}, ctx, deps)) as any).data
    expect(data.halted).toBe(true)
    expect(data.haltReason).toBe('stale_sync')
    expect(data.items).toEqual([])
    expect(data.count).toBe(0)
    expect(JSON.stringify(data)).not.toContain('recommendedDailyBudget')
  })
})
