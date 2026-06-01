// server/utils/socialReporting/normalize.ts
// Pure mappers: Meta Graph insights payloads → normalized metric snapshots (Slice 3 collection).
//
// ⚠️ Exact Graph insight metric NAMES vary by API version / media type and can't be verified in-repo.
// The shapes below follow the documented v20 names; verify against the live Graph API before relying
// on production numbers (same caveat posture as the audio MiniMax integration). `insightsToMap` is the
// robust, fully-tested core; the per-platform pickers are thin field maps over it.
import type { PostMetric, AccountMetric } from '~~/server/utils/social-providers/types'

/**
 * Flatten a Graph `insights` response `data` array into name → number.
 * Handles the two shapes Graph returns:
 *   { name, values: [{ value }] }      → uses the last value (lifetime/total)
 *   { name, total_value: { value } }    → uses total_value.value
 * A `value` that is an object (e.g. post_reactions_by_type_total) is summed across its numeric props.
 */
export function insightsToMap(data: any): Record<string, number> {
  const out: Record<string, number> = {}
  for (const m of Array.isArray(data?.data) ? data.data : []) {
    if (!m?.name) continue
    let v: any
    if (m.total_value && 'value' in m.total_value) v = m.total_value.value
    else if (Array.isArray(m.values) && m.values.length) v = m.values[m.values.length - 1]?.value
    out[m.name] = coerceNumber(v)
  }
  return out
}

function coerceNumber(v: any): number {
  if (typeof v === 'number') return v
  if (v && typeof v === 'object') {
    return Object.values(v).reduce<number>((s, x) => s + (typeof x === 'number' ? x : 0), 0)
  }
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/** Facebook post insights → PostMetric. (comments/shares come from post fields, merged separately.) */
export function mapFbPostInsights(postId: string, platformPostId: string, data: any, extra?: { comments?: number; shares?: number }): PostMetric {
  const m = insightsToMap(data)
  return {
    postId, platformPostId,
    impressions: m.post_impressions,
    reach: m.post_impressions_unique,
    clicks: m.post_clicks,
    reactions: m.post_reactions_by_type_total,
    videoViews: m.post_video_views,
    likes: m.post_reactions_like_total,
    commentsCount: extra?.comments,
    shares: extra?.shares,
    engagements: (m.post_reactions_by_type_total || 0) + (extra?.comments || 0) + (extra?.shares || 0) + (m.post_clicks || 0),
  }
}

/** Instagram media insights → PostMetric. */
export function mapIgMediaInsights(postId: string, platformPostId: string, data: any): PostMetric {
  const m = insightsToMap(data)
  return {
    postId, platformPostId,
    impressions: m.impressions,
    reach: m.reach,
    likes: m.likes,
    commentsCount: m.comments,
    shares: m.shares,
    saves: m.saved,
    videoViews: m.video_views,
    engagements: (m.likes || 0) + (m.comments || 0) + (m.shares || 0) + (m.saved || 0),
  }
}

/** Facebook page insights + fan_count → AccountMetric. */
export function mapFbAccountInsights(data: any, fanCount?: number): AccountMetric {
  const m = insightsToMap(data)
  return {
    followers: fanCount,
    impressions: m.page_impressions,
    reach: m.page_impressions_unique,
    profileViews: m.page_views_total,
  }
}

/** Instagram account insights + followers_count → AccountMetric. */
export function mapIgAccountInsights(data: any, followersCount?: number): AccountMetric {
  const m = insightsToMap(data)
  return {
    followers: followersCount,
    impressions: m.impressions,
    reach: m.reach,
    profileViews: m.profile_views,
  }
}
