import { describe, it, expect } from 'vitest'
import { buildCanonicalFactRows, canonicalFactToCsv } from '~~/server/utils/canonicalFact'
import { extractToken } from '~~/server/utils/exportTokens'

describe('buildCanonicalFactRows', () => {
  const rows = buildCanonicalFactRows({
    spend: [
      { date: '2026-05-02', channel: 'Paid Search', spend: 100, conversions: 5, revenue: 0 },
      { date: '2026-05-01', channel: 'Paid Social', spend: 50, conversions: 2, revenue: 0 }
    ],
    sessions: [
      { date: '2026-05-01', channel: 'Paid Search', sessions: 200 },
      { date: '2026-05-01', channel: 'Organic Search', sessions: 300 }
    ],
    leads: [
      { date: '2026-05-02', channel: 'Paid Search', leads: 4 }
    ]
  })

  it('merges the three sources per (date, channel)', () => {
    const r = rows.find(x => x.date === '2026-05-02' && x.channel === 'Paid Search')!
    expect(r).toMatchObject({ spend: 100, conversions: 5, leads: 4, sessions: 0 })
    const organic = rows.find(x => x.channel === 'Organic Search')!
    expect(organic).toMatchObject({ sessions: 300, spend: 0, leads: 0 })
  })

  it('sorts by date then channel', () => {
    expect(rows.map(r => `${r.date}|${r.channel}`)).toEqual([
      '2026-05-01|Organic Search',
      '2026-05-01|Paid Search',
      '2026-05-01|Paid Social',
      '2026-05-02|Paid Search'
    ])
  })
})

describe('canonicalFactToCsv', () => {
  it('emits a header + formatted rows', () => {
    const csv = canonicalFactToCsv([
      { date: '2026-05-01', channel: 'Paid Search', spend: 100, leads: 4, conversions: 5, revenue: 0, sessions: 200 }
    ])
    const [header, row] = csv.split('\n')
    expect(header).toBe('date,channel,spend,leads,conversions,revenue,sessions')
    expect(row).toBe('2026-05-01,Paid Search,100.00,4,5,0.00,200')
  })
})

describe('extractToken', () => {
  it('reads a bearer header', () => {
    expect(extractToken('Bearer abc123', null)).toBe('abc123')
    expect(extractToken('bearer abc123', null)).toBe('abc123')
  })
  it('falls back to the query token', () => {
    expect(extractToken(null, 'qtok')).toBe('qtok')
    expect(extractToken(undefined, undefined)).toBeNull()
  })
})
