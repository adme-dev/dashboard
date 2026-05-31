/**
 * Internal lifecycle status for an ad-publish row (the `status` column on
 * `banner_ad_publishes`). Distinct from `ad_status` (the operator's PAUSED/ACTIVE
 * intent passed to Meta).
 */
export type InternalAdStatus
  = | 'pending' // recorded intent, not yet on platform (Google stub)
    | 'pending_review' // Meta ad created, awaiting Meta review
    | 'active' // live and delivering
    | 'paused' // paused by us / ad set / campaign
    | 'rejected' // disapproved or has blocking issues
    | 'error' // our publish call failed
    | 'removed' // deleted / archived on the platform

/**
 * Statuses the sync runner keeps re-checking against Meta. `error` and `removed`
 * are terminal; `pending` is the Google stub's resting state and has nothing to
 * poll.
 */
export const NON_TERMINAL_STATUSES: InternalAdStatus[] = [
  'pending_review',
  'active',
  'paused',
  'rejected'
]

/**
 * Map a Meta `effective_status` value onto our internal lifecycle status.
 *
 * Unknown / missing values default to `pending_review` rather than something
 * terminal, so a Meta enum we haven't seen yet keeps getting re-checked instead
 * of silently sticking.
 */
export function mapMetaEffectiveStatus(
  effectiveStatus: string | null | undefined
): InternalAdStatus {
  switch ((effectiveStatus || '').toUpperCase()) {
    case 'ACTIVE':
      return 'active'
    case 'PAUSED':
    case 'ADSET_PAUSED':
    case 'CAMPAIGN_PAUSED':
      return 'paused'
    case 'PENDING_REVIEW':
    case 'IN_PROCESS':
    case 'PREAPPROVED':
    case 'PENDING_BILLING_INFO':
      return 'pending_review'
    case 'DISAPPROVED':
    case 'WITH_ISSUES':
      return 'rejected'
    case 'DELETED':
    case 'ARCHIVED':
      return 'removed'
    default:
      return 'pending_review'
  }
}
