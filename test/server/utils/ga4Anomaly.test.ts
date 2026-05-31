import { describe, it, expect } from 'vitest'
import { detectGa4Anomalies, type Ga4ChannelRow } from '~~/server/utils/anomalyDetection/analysers/ga4'

// Build N baseline days at a steady level, then a latest day, for one client.
function series(opts: {
  latest: { date: string, channels: Record<string, { sessions: number, keyEvents: number }> }
  baselineDays: number
  baselinePerDay: Record<string, { sessions: number, keyEvents: number }>
  baselineStart?: string
}): Ga4ChannelRow[] {
  const rows: Ga4ChannelRow[] = []
  for (const [ch, v] of Object.entries(opts.latest.channels)) {
    rows.push({ client_id: 'c1', client_name: 'Acme', metric_date: opts.latest.date, channel_group: ch, sessions: v.sessions, key_events: v.keyEvents })
  }
  // baseline days counting backwards from 2026-05-30
  for (let i = 1; i <= opts.baselineDays; i++) {
    const d = `2026-05-${String(30 - i).padStart(2, '0')}`
    for (const [ch, v] of Object.entries(opts.baselinePerDay)) {
      rows.push({ client_id: 'c1', client_name: 'Acme', metric_date: d, channel_group: ch, sessions: v.sessions, key_events: v.keyEvents })
    }
  }
  return rows
}

describe('detectGa4Anomalies', () => {
  it('returns nothing without enough baseline days', () => {
    const rows: Ga4ChannelRow[] = [
      { client_id: 'c1', client_name: 'Acme', metric_date: '2026-05-30', channel_group: 'Direct', sessions: 100, key_events: 10 }
    ]
    expect(detectGa4Anomalies(rows)).toEqual([])
  })

  it('flags a traffic drop (latest well below the 30-day average)', () => {
    const rows = series({
      latest: { date: '2026-05-31', channels: { Direct: { sessions: 20, keyEvents: 2 } } },
      baselineDays: 14,
      baselinePerDay: { Direct: { sessions: 200, keyEvents: 20 } }
    })
    const out = detectGa4Anomalies(rows)
    const drop = out.find(a => a.tags?.includes('traffic'))
    expect(drop).toBeTruthy()
    expect(drop!.type).toBe('ga4')
    expect(drop!.severity).toBe('critical') // 20/200 = 10% < 25%
  })

  it('does not flag low-volume clients (avg below the noise floor)', () => {
    const rows = series({
      latest: { date: '2026-05-31', channels: { Direct: { sessions: 1, keyEvents: 0 } } },
      baselineDays: 14,
      baselinePerDay: { Direct: { sessions: 10, keyEvents: 1 } } // avg 10 < 20 floor
    })
    expect(detectGa4Anomalies(rows).find(a => a.tags?.includes('traffic'))).toBeUndefined()
  })

  it('flags a conversion-rate collapse while traffic holds', () => {
    const rows = series({
      // sessions steady (~200), but key_events collapse from 20 → 1
      latest: { date: '2026-05-31', channels: { Direct: { sessions: 200, keyEvents: 1 } } },
      baselineDays: 14,
      baselinePerDay: { Direct: { sessions: 200, keyEvents: 20 } }
    })
    const out = detectGa4Anomalies(rows)
    expect(out.find(a => a.tags?.includes('conversion'))).toBeTruthy()
    // traffic itself is steady → no traffic-drop anomaly
    expect(out.find(a => a.tags?.includes('traffic'))).toBeUndefined()
  })

  it('flags a channel-mix shift', () => {
    const rows = series({
      // latest: all 300 sessions from Paid Search; baseline: split 50/50 Direct/Paid Search
      latest: { date: '2026-05-31', channels: { 'Paid Search': { sessions: 300, keyEvents: 15 } } },
      baselineDays: 14,
      baselinePerDay: { Direct: { sessions: 150, keyEvents: 8 }, 'Paid Search': { sessions: 150, keyEvents: 8 } }
    })
    const out = detectGa4Anomalies(rows)
    expect(out.find(a => a.tags?.includes('channel-mix'))).toBeTruthy()
  })

  it('is quiet when traffic and conversion are stable', () => {
    const rows = series({
      latest: { date: '2026-05-31', channels: { Direct: { sessions: 205, keyEvents: 21 } } },
      baselineDays: 14,
      baselinePerDay: { Direct: { sessions: 200, keyEvents: 20 } }
    })
    expect(detectGa4Anomalies(rows)).toEqual([])
  })
})
