import { describe, it, expect } from 'vitest'
import {
  mapWithConcurrency,
  buildGa4ChannelUpsert,
  GA4_FETCH_CONCURRENCY
} from '~~/server/utils/ga4Sync'

describe('mapWithConcurrency', () => {
  it('returns results in input order', async () => {
    const out = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async n => n * 10)
    expect(out).toEqual([10, 20, 30, 40, 50])
  })

  it('never exceeds the concurrency limit', async () => {
    let active = 0
    let maxActive = 0
    await mapWithConcurrency(Array.from({ length: 20 }, (_, i) => i), 4, async () => {
      active++
      maxActive = Math.max(maxActive, active)
      await new Promise(r => setTimeout(r, 5))
      active--
      return null
    })
    expect(maxActive).toBeLessThanOrEqual(4)
    expect(maxActive).toBeGreaterThan(1)
  })

  it('handles empty input', async () => {
    expect(await mapWithConcurrency([], 4, async () => 1)).toEqual([])
  })

  it('runs every item even when the limit exceeds the length', async () => {
    const seen: number[] = []
    await mapWithConcurrency([1, 2, 3], 10, async (n) => {
      seen.push(n)
      return n
    })
    expect([...seen].sort()).toEqual([1, 2, 3])
  })
})

describe('buildGa4ChannelUpsert', () => {
  const map = { connection_id: 'c1', client_id: 'cl1', property_id: 'p1' }
  const row = {
    date: '2026-05-30', channelGroup: 'Organic Search',
    sessions: 1, totalUsers: 2, newUsers: 3, engagedSessions: 4,
    engagementRate: 0.5, avgSessionDuration: 6, keyEvents: 7, purchaseRevenue: 8
  }

  it('emits one 13-column tuple per row with sequential placeholders + NOW()', () => {
    const { text, values } = buildGa4ChannelUpsert(map, [row, { ...row, date: '2026-05-31' }])
    expect(values).toHaveLength(26)
    expect(text).toContain('($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW())')
    expect(text).toContain('($14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,NOW())')
    expect(text).toContain('ON CONFLICT (connection_id, property_id, metric_date, channel_group)')
    expect(text).toContain('synced_at = NOW()')
  })

  it('flattens values in column order', () => {
    const { values } = buildGa4ChannelUpsert(map, [row])
    expect(values).toEqual(['c1', 'cl1', 'p1', '2026-05-30', 'Organic Search', 1, 2, 3, 4, 0.5, 6, 7, 8])
  })
})

describe('GA4_FETCH_CONCURRENCY', () => {
  it('stays within Cloudflare\'s 6 simultaneous-connection cap', () => {
    expect(GA4_FETCH_CONCURRENCY).toBeGreaterThan(1)
    expect(GA4_FETCH_CONCURRENCY).toBeLessThanOrEqual(6)
  })
})
