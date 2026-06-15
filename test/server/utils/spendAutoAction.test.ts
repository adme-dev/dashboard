import { describe, it, expect } from 'vitest'
import { decideAutoActions } from '~~/server/utils/spendAutoAction'
import type { AutoActionPolicy } from '~~/server/utils/spendAutoActionConfig'

const item = (over: any = {}) => ({ mediaSpendId: 'm1', platform: 'google', issueType: 'overpacing', severity: 'critical', currentDailyBudget: 100, recommendedDailyBudget: 120, clientId: 'c1', clientName: 'X', recommendedAction: 'Lower budget', ...over })
const policy = (over: any = {}): AutoActionPolicy => ({ enabled: true, perSeverity: { critical: 'propose', warning: 'notify', info: 'off' }, ...over })

describe('decideAutoActions', () => {
  it('maps severity → mode and drops off decisions', () => {
    const d = decideAutoActions([item(), item({ severity: 'warning' }), item({ severity: 'info' })] as any, policy())
    expect(d.map(x => x.mode)).toEqual(['propose', 'notify'])
  })
  it('returns nothing when policy disabled', () => {
    expect(decideAutoActions([item()] as any, policy({ enabled: false }))).toEqual([])
  })
  it('downgrades stale_sync from propose to notify', () => {
    const d = decideAutoActions([item({ issueType: 'stale_sync' })] as any, policy())
    expect(d[0].mode).toBe('notify')
  })
  it('skips malformed items without throwing', () => {
    const d = decideAutoActions([null, item()] as any, policy())
    expect(d).toHaveLength(1)
  })
})
