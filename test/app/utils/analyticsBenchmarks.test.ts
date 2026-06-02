import { describe, it, expect } from 'vitest'
import {
  benchmarkBadge,
  benchmarkMarkerPct,
  leaderboardRows,
  type BenchmarkPortfolio,
  type LeaderboardClient
} from '~~/app/utils/analyticsBenchmarks'

const portfolio: BenchmarkPortfolio = { count: 4, min: 10, p25: 17.5, median: 25, p75: 32.5, max: 40 }

describe('benchmarkBadge', () => {
  it('higher-is-better: high percentile rank reads as Top X% / success', () => {
    const b = benchmarkBadge(0.9, false)
    expect(b.label).toBe('Top 10%')
    expect(b.tone).toBe('success')
  })
  it('higher-is-better: low percentile rank reads as Bottom X% / error', () => {
    const b = benchmarkBadge(0.1, false)
    expect(b.label).toBe('Bottom 10%')
    expect(b.tone).toBe('error')
  })
  it('lower-is-better: low percentile rank is GOOD (low cost)', () => {
    const b = benchmarkBadge(0.1, true)
    expect(b.label).toBe('Top 10%')
    expect(b.tone).toBe('success')
  })
  it('mid values are neutral', () => {
    expect(benchmarkBadge(0.5, false).tone).toBe('neutral')
    expect(benchmarkBadge(0.5, false).label).toBe('Top 50%')
  })
  it('null rank → no badge', () => {
    expect(benchmarkBadge(null, false)).toBeNull()
  })
})

describe('benchmarkMarkerPct', () => {
  it('positions value along min→max as a percentage', () => {
    expect(benchmarkMarkerPct(25, portfolio)).toBe(50)
    expect(benchmarkMarkerPct(10, portfolio)).toBe(0)
    expect(benchmarkMarkerPct(40, portfolio)).toBe(100)
  })
  it('clamps out-of-range values', () => {
    expect(benchmarkMarkerPct(0, portfolio)).toBe(0)
    expect(benchmarkMarkerPct(100, portfolio)).toBe(100)
  })
  it('degenerate range (min===max) → 50', () => {
    expect(benchmarkMarkerPct(5, { count: 1, min: 5, p25: 5, median: 5, p75: 5, max: 5 })).toBe(50)
  })
  it('null value or null bounds → null', () => {
    expect(benchmarkMarkerPct(null, portfolio)).toBeNull()
    expect(benchmarkMarkerPct(25, { count: 0, min: null, p25: null, median: null, p75: null, max: null })).toBeNull()
  })
})

describe('leaderboardRows', () => {
  const clients: LeaderboardClient[] = [
    { clientId: 'a', clientName: 'Acme', metrics: { engagementRate: 0.5, cvr: 0.02, cpl: 30, cpa: 120 } },
    { clientId: 'b', clientName: 'Beta', metrics: { engagementRate: 0.7, cvr: 0.04, cpl: 18, cpa: 90 } },
    { clientId: 'c', clientName: 'Ceed', metrics: { engagementRate: null, cvr: 0.01, cpl: null, cpa: 200 } }
  ]
  it('ranks higher-is-better descending, nulls last', () => {
    const rows = leaderboardRows(clients, 'engagementRate', false)
    expect(rows.map(r => r.clientId)).toEqual(['b', 'a', 'c'])
    expect(rows[0].value).toBe(0.7)
  })
  it('ranks lower-is-better ascending, nulls last', () => {
    const rows = leaderboardRows(clients, 'cpl', true)
    expect(rows.map(r => r.clientId)).toEqual(['b', 'a', 'c'])
    expect(rows[0].value).toBe(18)
  })
  it('assigns 1-based rank, null values get no rank', () => {
    const rows = leaderboardRows(clients, 'cpl', true)
    expect(rows[0].rank).toBe(1)
    expect(rows[1].rank).toBe(2)
    expect(rows[2].rank).toBeNull()
  })
})
