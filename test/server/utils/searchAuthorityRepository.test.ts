import { describe, expect, it, vi } from 'vitest'
import {
  replacePageDate,
  replacePropertyDate,
  replaceQueryPageDate
} from '~~/server/utils/searchAuthority/repository'

const base = {
  clientId: '11111111-1111-4111-8111-111111111111',
  propertyMapId: '22222222-2222-4222-8222-222222222222',
  metricDate: '2026-07-31',
  searchType: 'web' as const,
  firstIncompleteDate: '2026-07-30'
}

function transactionHarness() {
  const calls: Array<{ sql: string, params: unknown[] }> = []
  const runTransaction = vi.fn(async callback => callback({
    query: async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params })
      return { rows: [] }
    }
  }))
  return { calls, runTransaction }
}

describe('Search Authority evidence repository', () => {
  it('atomically replaces query+page rows and preserves provider provisional state', async () => {
    const harness = transactionHarness()
    await replaceQueryPageDate({
      ...base,
      rows: [{
        keys: ['cannon alpha towing capacity', 'https://example.com/cannon-alpha'],
        clicks: 2,
        impressions: 50,
        ctr: 0.04,
        position: 7.2
      }]
    }, { runTransaction: harness.runTransaction })

    expect(harness.runTransaction).toHaveBeenCalledOnce()
    expect(harness.calls[0]?.sql).toContain('DELETE FROM gsc_daily_query_page')
    expect(harness.calls[1]?.sql).toContain('INSERT INTO gsc_daily_query_page')
    expect(harness.calls[1]?.params).toContain(true)
    expect(harness.calls.at(-1)?.sql).toContain('gsc_projection_checks')
    expect(harness.calls.at(-1)?.params).toContain('query_page')
  })

  it('replaces empty page results with zero rows while recording the checked day', async () => {
    const harness = transactionHarness()
    await replacePageDate({
      ...base,
      firstIncompleteDate: null,
      rows: []
    }, { runTransaction: harness.runTransaction })

    expect(harness.calls).toHaveLength(2)
    expect(harness.calls[0]?.sql).toContain('DELETE FROM gsc_daily_page')
    expect(harness.calls.some(call => call.sql.includes('INSERT INTO gsc_daily_page'))).toBe(false)
    expect(harness.calls[1]?.sql).toContain('gsc_projection_checks')
    expect(harness.calls[1]?.params).toContain('2026-07-31')
    expect(harness.calls[1]?.params).toContain(0)
  })

  it('stores property totals independently instead of deriving them from detail rows', async () => {
    const harness = transactionHarness()
    await replacePropertyDate({
      ...base,
      firstIncompleteDate: null,
      rows: [{
        keys: [],
        clicks: 20,
        impressions: 900,
        ctr: 0.022,
        position: 12.4
      }]
    }, { runTransaction: harness.runTransaction })

    expect(harness.calls[0]?.sql).toContain('DELETE FROM gsc_daily_property')
    expect(harness.calls[1]?.sql).toContain('INSERT INTO gsc_daily_property')
    expect(harness.calls[1]?.sql).not.toContain('gsc_daily_query_page')
    expect(harness.calls.at(-1)?.params).toContain('property')
  })
})
