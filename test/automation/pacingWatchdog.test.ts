// test/automation/pacingWatchdog.test.ts
import { describe, expect, it } from 'vitest'
import {
  isActionablePacingItem,
  pacingItemToEscalation,
  dedupeKey,
  filterAlreadyPending,
  labelForIssue,
} from '~~/server/utils/automation/pacingWatchdog'

function item(overrides: Record<string, any> = {}): any {
  return {
    mediaSpendId: 'ms-1', clientName: 'Knox GWM', platform: 'meta',
    campaignId: 'c-1', campaignName: 'EOFY Lead Gen', campaignStatus: 'ACTIVE',
    issueType: 'overpacing', severity: 'critical',
    budget: 3000, mtdSpend: 2000, expectedToDate: 1500, projectedMonthEnd: 4000,
    currentDailyBudget: 100, recommendedDailyBudget: 70, pacingRatio: 1.33,
    performance: {}, syncedAt: '2026-06-23T00:00:00Z', recommendedAction: 'Reduce daily budget',
    canApplyAutomatically: false, ...overrides,
  }
}

describe('isActionablePacingItem', () => {
  it('accepts actionable issue + severity', () => {
    expect(isActionablePacingItem(item())).toBe(true)
    expect(isActionablePacingItem(item({ issueType: 'stale_sync', severity: 'warning' }))).toBe(true)
  })
  it('rejects non-actionable issue types and info severity', () => {
    expect(isActionablePacingItem(item({ issueType: 'zero_conversion' }))).toBe(false)
    expect(isActionablePacingItem(item({ severity: 'info' }))).toBe(false)
  })
})

describe('pacingItemToEscalation', () => {
  it('maps an overpacing item to a reduce_daily_budget proposal (never auto-applied)', () => {
    const e = pacingItemToEscalation(item(), { runId: 'run-1' })
    expect(e.capability).toBe('budget_pacing_watchdog')
    expect(e.severity).toBe('critical')
    expect(e.runId).toBe('run-1')
    expect(e.title).toContain('Knox GWM')
    expect(e.title).toContain('EOFY Lead Gen')
    expect(e.proposedAction).toMatchObject({ action: 'reduce_daily_budget', from: 100, to: 70, campaignId: 'c-1', platform: 'meta' })
    expect(e.detail).toMatchObject({ campaignId: 'c-1', issueType: 'overpacing', platform: 'meta' })
  })
  it('maps underpacing to increase, stale_sync to resync, no_spend to investigate', () => {
    expect(pacingItemToEscalation(item({ issueType: 'underpacing' }), {}).proposedAction).toMatchObject({ action: 'increase_daily_budget' })
    expect(pacingItemToEscalation(item({ issueType: 'stale_sync' }), {}).proposedAction).toMatchObject({ action: 'resync_spend' })
    expect(pacingItemToEscalation(item({ issueType: 'no_spend' }), {}).proposedAction).toMatchObject({ action: 'investigate_delivery' })
  })
})

describe('dedupeKey + filterAlreadyPending', () => {
  it('builds a stable key from platform/campaign/issue', () => {
    expect(dedupeKey({ platform: 'meta', campaignId: 'c-1', issueType: 'overpacing' })).toBe('meta::c-1::overpacing')
  })
  it('drops candidates whose key matches an already-pending escalation detail', () => {
    const candidates = [
      pacingItemToEscalation(item({ campaignId: 'c-1', issueType: 'overpacing' }), {}),
      pacingItemToEscalation(item({ campaignId: 'c-2', issueType: 'overpacing' }), {}),
    ]
    const pending = [{ platform: 'meta', campaignId: 'c-1', issueType: 'overpacing' }]
    const fresh = filterAlreadyPending(candidates, pending)
    expect(fresh).toHaveLength(1)
    expect((fresh[0].detail as any).campaignId).toBe('c-2')
  })
})

describe('labelForIssue', () => {
  it('gives a human label per issue type', () => {
    expect(labelForIssue('overpacing')).toMatch(/over/i)
    expect(labelForIssue('no_spend')).toMatch(/no spend/i)
  })
})
