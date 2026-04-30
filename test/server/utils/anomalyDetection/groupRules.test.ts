// test/server/utils/anomalyDetection/groupRules.test.ts
import { describe, it, expect } from 'vitest'
import { applyGroupRules } from '~~/server/utils/anomalyDetection/groupRules'
import type { DetectedAnomaly, AnomalyType } from '~~/server/utils/anomalyDetection/types'

const make = (fingerprint: string, ctx?: any): DetectedAnomaly => ({
  fingerprint,
  type: fingerprint.split(':')[0] as AnomalyType,
  severity: 'warning',
  title: '',
  description: '',
  dataSources: [],
  context: ctx,
})

describe('applyGroupRules', () => {
  it('groups profitability findings for the same period', () => {
    const list = [
      make('profitability:low-margin', { period: 'Mar 2026' }),
      make('profitability:margin-compression', { period: 'Mar 2026' }),
      make('revenue:revenue-decline', { period: 'Mar 2026' }),
    ]
    applyGroupRules(list)
    expect(list[0].groupKey).toBe('incident:profitability:Mar 2026')
    expect(list[1].groupKey).toBe('incident:profitability:Mar 2026')
    expect(list[2].groupKey).toBe('incident:profitability:Mar 2026')
  })

  it('groups budget findings for the same period (overspend + per-category)', () => {
    const list = [
      make('budget:overspend-warning', { period: 'Mar 2026' }),
      make('budget:cat-software', { period: 'Mar 2026' }),
      make('budget:cat-travel', { period: 'Mar 2026' }),
    ]
    applyGroupRules(list)
    expect(list[0].groupKey).toBe('incident:budget:Mar 2026')
    expect(list[1].groupKey).toBe('incident:budget:Mar 2026')
    expect(list[2].groupKey).toBe('incident:budget:Mar 2026')
  })

  it('groups liquidity findings for the same period', () => {
    const list = [
      make('cashflow:high-burn-rate', { period: 'Apr 2026' }),
      make('cashflow:low-cash-reserves', { period: 'Apr 2026' }),
      make('cashflow:shortfall-projected', { period: 'Apr 2026' }),
    ]
    applyGroupRules(list)
    expect(list[0].groupKey).toBe('incident:liquidity:Apr 2026')
    expect(list[1].groupKey).toBe('incident:liquidity:Apr 2026')
    expect(list[2].groupKey).toBe('incident:liquidity:Apr 2026')
  })

  it('does not group unrelated findings', () => {
    const list = [
      make('expenses:concentration', { category: 'Software' }),
      make('receivables:slow-payer-risk', { period: 'Apr 2026' }),
    ]
    applyGroupRules(list)
    expect(list[0].groupKey).toBeUndefined()
    expect(list[1].groupKey).toBeUndefined()
  })

  it('does not cross-group findings from different periods', () => {
    const list = [
      make('profitability:low-margin', { period: 'Mar 2026' }),
      make('profitability:margin-compression', { period: 'Apr 2026' }),
    ]
    applyGroupRules(list)
    expect(list[0].groupKey).toBe('incident:profitability:Mar 2026')
    expect(list[1].groupKey).toBe('incident:profitability:Apr 2026')
    // These are SEPARATE incidents because the periods differ
    expect(list[0].groupKey).not.toBe(list[1].groupKey)
  })

  it('does not group when only one finding matches a cluster (no real correlation)', () => {
    const list = [
      make('profitability:low-margin', { period: 'Mar 2026' }),
    ]
    applyGroupRules(list)
    // Single finding → no group (a "cluster" of 1 isn't an incident)
    expect(list[0].groupKey).toBeUndefined()
  })

  it('groups the YoY revenue decline alongside profitability findings for the same period', () => {
    const list = [
      make('revenue:yoy-decline', { period: 'Mar 2026' }),
      make('profitability:low-margin', { period: 'Mar 2026' }),
    ]
    applyGroupRules(list)
    expect(list[0].groupKey).toBe('incident:profitability:Mar 2026')
    expect(list[1].groupKey).toBe('incident:profitability:Mar 2026')
  })
})
