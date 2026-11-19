// server/utils/adsGovernance/proposalExpiry.ts
// Config-driven, business-day-aware lifetime for marketing department proposals (default 72 h with
// Melbourne weekends not counting). Replaces the fixed 24 h window that lapsed the team's first
// November budget proposals before a reviewer saw them. Applies to marketing proposals only.
import type { H3Event } from 'h3'
import { resolveAdsGovernanceConfig } from './config'
import { addBusinessAwareHours, GOVERNANCE_TIMEZONE } from './businessTime'

export function marketingProposalExpiresAt(event?: H3Event, now: Date = new Date()): Date {
  const config = resolveAdsGovernanceConfig(event)
  return addBusinessAwareHours(now, config.proposalExpiryHours, {
    timezone: GOVERNANCE_TIMEZONE,
    skipNonBusinessDays: config.proposalExpiryBusinessDays
  })
}
