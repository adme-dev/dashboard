import type { SocialPlannerLane } from '~/types'

/** Minimal shape the board needs to place a post in a lane. */
export interface LaneInput {
  status: string
  approval_requested_at?: string | null
  approved_at?: string | null
}

/** Derive the board lane from a post's status + approval fields. No enum change required. */
export function deriveLane(post: LaneInput): SocialPlannerLane {
  switch (post.status) {
    case 'published':
    case 'partially_published':
      return 'published'
    case 'approved':
    case 'scheduled':
    case 'publishing':
    case 'failed':     // failed/cancelled were past 'scheduled'; show there with an attention badge
    case 'cancelled':
      return 'scheduled'
    case 'draft':
    default:
      return post.approval_requested_at && !post.approved_at ? 'needs_approval' : 'draft'
  }
}

/** Posts that errored or were cancelled get a visible badge wherever they land. */
export function needsAttention(post: { status: string }): boolean {
  return post.status === 'failed' || post.status === 'cancelled'
}

export const LANES: { key: SocialPlannerLane; label: string }[] = [
  { key: 'draft', label: 'Draft' },
  { key: 'needs_approval', label: 'Needs approval' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'published', label: 'Published' },
]
