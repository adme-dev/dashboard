import { describe, expect, it } from 'vitest'
import { deduplicateRowsByKey } from '~~/server/utils/ga4DimensionSync'

describe('deduplicateRowsByKey', () => {
  it('keeps one deterministic last row for a repeated GA4 upsert key', () => {
    const rows = [
      { date: '2026-07-22', dimension: '(not set)', sessions: 3 },
      { date: '2026-07-22', dimension: 'organic', sessions: 5 },
      { date: '2026-07-22', dimension: '(not set)', sessions: 3 },
    ]

    expect(deduplicateRowsByKey(rows, row => JSON.stringify([row.date, row.dimension]))).toEqual([
      { date: '2026-07-22', dimension: '(not set)', sessions: 3 },
      { date: '2026-07-22', dimension: 'organic', sessions: 5 },
    ])
  })

  it('uses the latest GA4 row when duplicate keys disagree', () => {
    const rows = [
      { event: 'generate_lead', count: 1 },
      { event: 'generate_lead', count: 2 },
    ]

    expect(deduplicateRowsByKey(rows, row => row.event)).toEqual([
      { event: 'generate_lead', count: 2 },
    ])
  })
})
