import { describe, it, expect, vi } from 'vitest'
import { executeAutoActions } from '~~/server/utils/spendAutoActionExecutor'

const dec = (over: any = {}) => ({ mode: 'propose', item: { mediaSpendId: 'm1', platform: 'google', issueType: 'overpacing', severity: 'critical', currentDailyBudget: 100, recommendedDailyBudget: 120, recommendedAction: 'Lower', ...over } })

function deps(over: any = {}) {
  return {
    recordCampaignAction: vi.fn().mockResolvedValue({ id: 'a1' }),
    hasOpenAutoAction: vi.fn().mockResolvedValue(false),
    notify: vi.fn().mockResolvedValue(undefined),
    ...over,
  }
}

describe('executeAutoActions', () => {
  it('proposes a planned auto_action + notifies', async () => {
    const d = deps()
    const r = await executeAutoActions([dec()] as any, d)
    expect(r).toEqual({ proposed: 1, notified: 1, skipped: 0 })
    const input = d.recordCampaignAction.mock.calls[0][0]
    expect(input.actionStatus).toBe('planned')
    expect(input.metadata.source).toBe('auto_action')
    expect(input.newValue).toEqual({ dailyBudget: 120 })
  })
  it('skips proposing when an open auto_action already exists', async () => {
    const d = deps({ hasOpenAutoAction: vi.fn().mockResolvedValue(true) })
    const r = await executeAutoActions([dec()] as any, d)
    expect(r.proposed).toBe(0); expect(r.skipped).toBe(1)
    expect(d.recordCampaignAction).not.toHaveBeenCalled()
  })
  it('notify mode notifies without recording an action', async () => {
    const d = deps()
    const r = await executeAutoActions([{ ...dec(), mode: 'notify' }] as any, d)
    expect(d.recordCampaignAction).not.toHaveBeenCalled()
    expect(r.notified).toBe(1)
  })
  it('isolates a per-item failure', async () => {
    const d = deps({ recordCampaignAction: vi.fn().mockRejectedValue(new Error('boom')) })
    const r = await executeAutoActions([dec()] as any, d)
    expect(r.skipped).toBe(1); expect(r.proposed).toBe(0)
  })
})
