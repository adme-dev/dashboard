// server/utils/socialListening/analytics.ts
// Pure aggregators for the listening dashboard. Operate on already-fetched mention rows (joined
// with their query's category). No I/O — fully unit-testable.

export interface MentionRow {
  source: string
  sentiment: string | null
  topics: string[] | null
  published_at: string | null
  category: string | null
}

export function sentimentSplit(rows: MentionRow[]): { positive: number; neutral: number; negative: number; unknown: number } {
  const out = { positive: 0, neutral: 0, negative: 0, unknown: 0 }
  for (const r of rows) {
    const s = (r.sentiment ?? 'unknown') as keyof typeof out
    if (s in out) out[s]++; else out.unknown++
  }
  return out
}

function rankCounts(pairs: string[]): Array<{ key: string; count: number }> {
  const m = new Map<string, number>()
  for (const k of pairs) m.set(k, (m.get(k) ?? 0) + 1)
  return [...m.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
}

export function volumeByDay(rows: MentionRow[]): Array<{ date: string; count: number }> {
  const m = new Map<string, number>()
  for (const r of rows) {
    if (!r.published_at) continue
    const date = r.published_at.slice(0, 10)
    m.set(date, (m.get(date) ?? 0) + 1)
  }
  return [...m.entries()].map(([date, count]) => ({ date, count })).sort((a, b) => a.date.localeCompare(b.date))
}

export function shareOfVoice(rows: MentionRow[]): Array<{ category: string; count: number }> {
  return rankCounts(rows.map(r => r.category ?? 'uncategorized')).map(({ key, count }) => ({ category: key, count }))
}

export function topTopics(rows: MentionRow[], n = 10): Array<{ topic: string; count: number }> {
  return rankCounts(rows.flatMap(r => r.topics ?? [])).slice(0, n).map(({ key, count }) => ({ topic: key, count }))
}

export function topSources(rows: MentionRow[]): Array<{ source: string; count: number }> {
  return rankCounts(rows.map(r => r.source)).map(({ key, count }) => ({ source: key, count }))
}

export function buildListeningOverview(rows: MentionRow[]) {
  return {
    total: rows.length,
    sentiment: sentimentSplit(rows),
    volume: volumeByDay(rows),
    shareOfVoice: shareOfVoice(rows),
    topTopics: topTopics(rows, 10),
    topSources: topSources(rows),
  }
}
