import { describe, it, expect } from 'vitest'
import { sentimentSplit, volumeByDay, shareOfVoice, topTopics, topSources, buildListeningOverview } from '~~/server/utils/socialListening/analytics'

type Row = { source: string; sentiment: string | null; topics: string[] | null; published_at: string | null; category: string | null }
const rows: Row[] = [
  { source: 'reddit', sentiment: 'positive', topics: ['price', 'quality'], published_at: '2026-06-01T10:00:00Z', category: 'brand' },
  { source: 'reddit', sentiment: 'negative', topics: ['support'], published_at: '2026-06-01T12:00:00Z', category: 'brand' },
  { source: 'news', sentiment: 'neutral', topics: ['price'], published_at: '2026-06-02T08:00:00Z', category: 'competitor' },
]

describe('listening analytics', () => {
  it('sentimentSplit counts by bucket', () => {
    expect(sentimentSplit(rows)).toEqual({ positive: 1, neutral: 1, negative: 1, unknown: 0 })
  })
  it('volumeByDay groups by UTC date ascending', () => {
    expect(volumeByDay(rows)).toEqual([{ date: '2026-06-01', count: 2 }, { date: '2026-06-02', count: 1 }])
  })
  it('shareOfVoice counts mentions per category', () => {
    expect(shareOfVoice(rows)).toEqual([{ category: 'brand', count: 2 }, { category: 'competitor', count: 1 }])
  })
  it('topTopics ranks flattened topics', () => {
    expect(topTopics(rows, 2)).toEqual([{ topic: 'price', count: 2 }, { topic: 'quality', count: 1 }])
  })
  it('topSources ranks by source', () => {
    expect(topSources(rows)).toEqual([{ source: 'reddit', count: 2 }, { source: 'news', count: 1 }])
  })
  it('buildListeningOverview bundles everything + total', () => {
    const o = buildListeningOverview(rows)
    expect(o.total).toBe(3)
    expect(o.sentiment.positive).toBe(1)
    expect(o.volume.length).toBe(2)
    expect(o.shareOfVoice[0]).toEqual({ category: 'brand', count: 2 })
  })
})
