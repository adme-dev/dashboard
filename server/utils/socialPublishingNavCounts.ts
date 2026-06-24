import { queryOne } from '~~/server/utils/db'
import { isPlannerEnabled } from '~~/server/utils/socialPublishing/plannerGate'

/**
 * Live counts that drive the Social Publishing suite tile-nav badges. Keys
 * mirror SocialPublishingNavCountKey in app/utils/socialPublishingNavigation.ts.
 */
export interface SocialPublishingNavCounts {
  accounts: number
  scheduled: number
  pendingApprovals: number
  drafts: number
  campaigns: number
}

/**
 * One round-trip for all four badge counts. clientId is optional: when omitted
 * the counts span every client (the `$1::uuid IS NULL` arm short-circuits the
 * filter). The pending-approval predicate mirrors approvals/badge.get.ts so the
 * Approvals badge and tile never disagree.
 */
export async function getSocialPublishingNavCounts(
  clientId?: string | null
): Promise<SocialPublishingNavCounts> {
  const row = await queryOne<Partial<SocialPublishingNavCounts>>(
    `SELECT
       (SELECT COUNT(*)::int FROM social_accounts
         WHERE is_active = true
           AND ($1::uuid IS NULL OR client_id = $1)) AS accounts,
       (SELECT COUNT(*)::int FROM social_posts
         WHERE status = 'scheduled'
           AND ($1::uuid IS NULL OR client_id = $1)) AS scheduled,
       (SELECT COUNT(*)::int FROM social_posts
         WHERE approval_requested_at IS NOT NULL
           AND approved_at IS NULL
           AND status NOT IN ('cancelled', 'published')
           AND ($1::uuid IS NULL OR client_id = $1)) AS "pendingApprovals",
       (SELECT COUNT(*)::int FROM social_posts
         WHERE status = 'draft'
           AND ($1::uuid IS NULL OR client_id = $1)) AS drafts,
       (SELECT COUNT(*)::int FROM social_campaigns
         WHERE ($1::uuid IS NULL OR client_id = $1)) AS campaigns`,
    [clientId ?? null]
  )

  return {
    accounts: row?.accounts ?? 0,
    scheduled: row?.scheduled ?? 0,
    pendingApprovals: row?.pendingApprovals ?? 0,
    drafts: row?.drafts ?? 0,
    // Planner dormant → don't surface a campaigns badge even though the table exists.
    campaigns: isPlannerEnabled() ? (row?.campaigns ?? 0) : 0,
  }
}
