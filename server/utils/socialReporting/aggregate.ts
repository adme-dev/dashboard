// server/utils/socialReporting/aggregate.ts
// Pure reporting math for Slice 3 (3b). Operates on plain metric rows so it's fully unit-testable
// independent of the DB/endpoints.

export interface PostMetricRow {
  post_id: string
  platform: string
  impressions: number | null
  reach: number | null
  engagements: number | null
  clicks: number | null
  likes: number | null
  comments_count: number | null
  shares: number | null
  saves: number | null
  video_views: number | null
  reactions: number | null
  published_at?: string | null
  content?: string | null
  permalink?: string | null
  platform_results?: Record<string, any> | null
}

export interface MetricTotals {
  impressions: number | null
  reach: number | null
  engagements: number | null
  clicks: number | null
  likes: number | null
  comments: number | null
  shares: number | null
  saves: number | null
  posts: number
}

/** Percentage change current vs prior. null when prior is 0 (no baseline — avoid divide-by-zero / ∞). */
export function socialPctDelta(current: number | null, prior: number | null): number | null {
  if (current == null || prior == null || !Number.isFinite(current) || !Number.isFinite(prior) || prior === 0) return null
  return Math.round(((current - prior) / prior) * 1000) / 10 // 1 decimal
}

/** Engagement rate (%) against the chosen denominator (reach preferred, impressions fallback). */
export function engagementRate(engagements: number | null, reach: number | null, impressions: number | null = null): number | null {
  if (engagements == null) return null
  const denom = reach || impressions
  if (denom == null) return null
  if (!denom) return 0
  return Math.round((engagements / denom) * 1000) / 10
}

/** Sum a set of post metric rows into headline totals. */
export function rollupPostMetrics(rows: PostMetricRow[]): MetricTotals {
  const sum = (key: keyof PostMetricRow): number | null => {
    const values = rows.map(row => row[key])
    if (!values.length || values.some(value => typeof value !== 'number' || !Number.isFinite(value))) return null
    return (values as number[]).reduce((total, value) => total + value, 0)
  }
  return {
    impressions: sum('impressions'), reach: sum('reach'), engagements: sum('engagements'),
    clicks: sum('clicks'), likes: sum('likes'), comments: sum('comments_count'),
    shares: sum('shares'), saves: sum('saves'), posts: rows.length,
  }
}

/** Top-N posts by engagement rate (reach-normalized), tie-broken by raw engagements. */
export function rankBestContent(rows: PostMetricRow[], n = 5): Array<PostMetricRow & { engagementRate: number | null }> {
  return rows
    .map(r => ({ ...r, engagementRate: engagementRate(r.engagements, r.reach, r.impressions) }))
    .sort((a, b) => ((b.engagementRate ?? -1) - (a.engagementRate ?? -1)) || ((b.engagements ?? -1) - (a.engagements ?? -1)))
    .slice(0, Math.max(0, n))
}

/**
 * Posting cadence: count + average engagement per weekday (0=Sun..6=Sat). Drives a heatmap/bar
 * showing when this client posts and how it performs. Rows without a published_at are ignored.
 */
export function cadenceByWeekday(rows: PostMetricRow[]): Array<{ weekday: number; posts: number; avgEngagements: number | null }> {
  const buckets = Array.from({ length: 7 }, (_, weekday) => ({ weekday, posts: 0, total: 0, unavailable: false }))
  for (const r of rows) {
    if (!r.published_at) continue
    const d = new Date(r.published_at)
    if (Number.isNaN(d.getTime())) continue
    const b = buckets[d.getUTCDay()]!
    b.posts++
    if (r.engagements == null) b.unavailable = true
    else b.total += r.engagements
  }
  return buckets.map(b => ({ weekday: b.weekday, posts: b.posts, avgEngagements: b.unavailable ? null : b.posts ? Math.round(b.total / b.posts) : 0 }))
}

/** Build a headline KPI block with deltas vs the prior equal-length period. */
export function buildOverview(current: PostMetricRow[], prior: PostMetricRow[]) {
  const cur = rollupPostMetrics(current)
  const prev = rollupPostMetrics(prior)
  const kpi = (c: number | null, p: number | null) => ({ value: c, deltaPct: socialPctDelta(c, p) })
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
