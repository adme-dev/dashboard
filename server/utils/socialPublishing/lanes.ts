// Server-side copy of the planner lane derivation. Mirrors app/utils/socialPlannerLanes.ts
// (the frontend can't import server utils and Nitro can't resolve ~/utils at runtime, so the
// tiny pure switch lives in both places; app/utils carries the unit tests).
import type { SocialPlannerLane } from '~/types'

export interface LaneInput {
  status: string
  approval_requested_at?: string | null
  approved_at?: string | null
}

export function deriveLane(post: LaneInput): SocialPlannerLane {
  switch (post.status) {
    case 'published':
    case 'partially_published':
      return 'published'
    case 'approved':
    case 'scheduled':
    case 'publishing':
    case 'failed':
    case 'cancelled':
      return 'scheduled'
    case 'draft':
    default:
      return post.approval_requested_at && !post.approved_at ? 'needs_approval' : 'draft'
  }
}

export function needsAttention(post: { status: string }): boolean {
  return post.status === 'failed' || post.status === 'cancelled'
}
