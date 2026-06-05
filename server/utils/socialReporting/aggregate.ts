// server/utils/socialReporting/aggregate.ts
// Pure reporting math for Slice 3 (3b). Operates on plain metric rows so it's fully unit-testable
// independent of the DB/endpoints.

export interface PostMetricRow {
  post_id: string
  platform: string
  impressions: number
  reach: number
  engagements: number
  clicks: number
  likes: number
  comments_count: number
  shares: number
  saves: number
  video_views: number
  reactions: number
  published_at?: string | null
  content?: string | null
  permalink?: string | null
  platform_results?: Record<string, any> | null
}

export interface MetricTotals {
  impressions: number
  reach: number
  engagements: number
  clicks: number
  likes: number
  comments: number
  shares: number
  saves: number
  posts: number
}

/** Percentage change current vs prior. null when prior is 0 (no baseline — avoid divide-by-zero / ∞). */
export function socialPctDelta(current: number, prior: number): number | null {
  if (!prior) return null
  return Math.round(((current - prior) / prior) * 1000) / 10 // 1 decimal
}

/** Engagement rate (%) against the chosen denominator (reach preferred, impressions fallback). */
export function engagementRate(engagements: number, reach: number, impressions = 0): number {
  const denom = reach || impressions
  if (!denom) return 0
  return Math.round((engagements / denom) * 1000) / 10
}

/** Sum a set of post metric rows into headline totals. */
export function rollupPostMetrics(rows: PostMetricRow[]): MetricTotals {
  const t: MetricTotals = { impressions: 0, reach: 0, engagements: 0, clicks: 0, likes: 0, comments: 0, shares: 0, saves: 0, posts: rows.length }
  for (const r of rows) {
    t.impressions += r.impressions || 0
    t.reach += r.reach || 0
    t.engagements += r.engagements || 0
    t.clicks += r.clicks || 0
    t.likes += r.likes || 0
    t.comments += r.comments_count || 0
    t.shares += r.shares || 0
    t.saves += r.saves || 0
  }
  return t
}

/** Top-N posts by engagement rate (reach-normalized), tie-broken by raw engagements. */
export function rankBestContent(rows: PostMetricRow[], n = 5): Array<PostMetricRow & { engagementRate: number }> {
  return rows
    .map(r => ({ ...r, engagementRate: engagementRate(r.engagements || 0, r.reach || 0, r.impressions || 0) }))
    .sort((a, b) => (b.engagementRate - a.engagementRate) || ((b.engagements || 0) - (a.engagements || 0)))
    .slice(0, Math.max(0, n))
}

/**
 * Posting cadence: count + average engagement per weekday (0=Sun..6=Sat). Drives a heatmap/bar
 * showing when this client posts and how it performs. Rows without a published_at are ignored.
 */
export function cadenceByWeekday(rows: PostMetricRow[]): Array<{ weekday: number; posts: number; avgEngagements: number }> {
  const buckets = Array.from({ length: 7 }, (_, weekday) => ({ weekday, posts: 0, total: 0 }))
  for (const r of rows) {
    if (!r.published_at) continue
    const d = new Date(r.published_at)
    if (Number.isNaN(d.getTime())) continue
    const b = buckets[d.getUTCDay()]!
    b.posts++
    b.total += r.engagements || 0
  }
  return buckets.map(b => ({ weekday: b.weekday, posts: b.posts, avgEngagements: b.posts ? Math.round(b.total / b.posts) : 0 }))
}

/** Build a headline KPI block with deltas vs the prior equal-length period. */
export function buildOverview(current: PostMetricRow[], prior: PostMetricRow[]) {
  const cur = rollupPostMetrics(current)
  const prev = rollupPostMetrics(prior)
  const kpi = (c: number, p: number) => ({ value: c, deltaPct: socialPctDelta(c, p) })
  return {
    posts: kpi(cur.posts, prev.posts),
    impressions: kpi(cur.impressions, prev.impressions),
    reach: kpi(cur.reach, prev.reach),
    engagements: kpi(cur.engagements, prev.engagements),
    clicks: kpi(cur.clicks, prev.clicks),
    engagementRate: {
      value: engagementRate(cur.engagements, cur.reach, cur.impressions),
      deltaPct: socialPctDelta(
        engagementRate(cur.engagements, cur.reach, cur.impressions),
        engagementRate(prev.engagements, prev.reach, prev.impressions),
      ),
    },
  }
}
