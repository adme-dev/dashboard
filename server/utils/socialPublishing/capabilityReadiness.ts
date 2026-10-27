import { STAFF_REVIEWED_PUBLISH_PLATFORMS, SOCIAL_OPERATIONS, providerOperationSupport, type SocialOperation, type ReadinessState } from '~~/shared/socialCapabilityReadiness'
import { classifySocialPublishingAccountHealth, type SocialPublishingAccountHealthInput } from './accountHealth'

export interface StaffSocialAvailability {
  /** Set only from freshly resolved connector authority, never model input. */
  clientMapped: boolean
  socialDraft: boolean
  reporting: boolean
  signedRead: boolean
  signedWrite: boolean
}
export interface BrowserSocialAvailability { channel: 'browser', clientMapped: boolean, writable: boolean, canPublish: boolean }
export interface OperationReadiness { operation: SocialOperation, providerState: ReadinessState, authorityChannel: 'browser' | 'connector', state: ReadinessState, reason: string }
export function socialCapabilityReadiness(account: SocialPublishingAccountHealthInput, authority?: StaffSocialAvailability | BrowserSocialAvailability): OperationReadiness[] {
  const browser = authority && 'channel' in authority && authority.channel === 'browser' ? authority : null
  const staff = browser ? undefined : authority as StaffSocialAvailability | undefined
  return SOCIAL_OPERATIONS.map((operation) => {
    const provider = providerOperationSupport(account.platform, operation)
    const row = (state: ReadinessState, reason: string): OperationReadiness => ({ operation, authorityChannel: browser ? 'browser' : 'connector', providerState: provider.state, state, reason })
    if (!browser && operation === 'organic_publish' && !(STAFF_REVIEWED_PUBLISH_PLATFORMS as readonly string[]).includes(account.platform)) return row('unsupported', 'This platform is not offered by the reviewed staff publishing tools.')
    if (provider.state !== 'available') return row(provider.state, provider.reason)
    // Task3 exposes no inbox or comment MCP operation. Provider methods cannot create tool coverage.
    if (!browser && (operation === 'organic_comment' || operation === 'inbox_read')) return row('unsupported', 'The staff connector does not expose a reviewed comment or inbox operation.')
    if (browser && (operation === 'organic_comment' || operation === 'inbox_read')) return row('external_blocked', 'Browser engagement requires separate channel-specific connection and permission checks.')
    if (!authority?.clientMapped) return row('external_blocked', browser ? 'Current browser permissions and active client access must be verified.' : 'Current staff grants, signed connector scope and client assignment must be verified.')
    if (browser ? (['organic_publish', 'organic_comment'].includes(operation) && (!browser.writable || !browser.canPublish)) : (!staff?.signedRead || (operation === 'organic_publish' ? !staff.socialDraft || !staff.signedWrite : !staff.reporting))) return row('external_blocked', browser ? !browser.writable ? 'The current browser role is read-only.' : 'The current browser role does not permit publishing.' : 'The current connector grant or signed scope does not permit this operation.')
    if (operation === 'paid_reporting') return row('external_blocked', 'Use the scoped paid reporting tools with an active advertiser connection; creator OAuth does not establish advertiser access.')
    const eligibility = providerAccountOperationEligibility(account, operation)
    if (eligibility.state !== 'available') return row(eligibility.state, eligibility.reason)
    return row('available', operation === 'organic_publish' ? browser ? 'Available through the browser publishing workflow; delegated drafts still require independent review.' : 'Draft and submit for independent review; the connector cannot publish directly.' : 'Available through scoped reporting reads.')
  })
}

/** Account/provider eligibility only. Actor permissions and connector scopes are checked separately. */
export function providerAccountOperationEligibility(account: SocialPublishingAccountHealthInput, operation: SocialOperation): { state: ReadinessState, reason: string } {
  const provider = providerOperationSupport(account.platform, operation)
  if (provider.state !== 'available') return provider
  if (operation === 'paid_reporting') return { state: 'external_blocked', reason: 'Use the scoped paid reporting tools with an active advertiser connection; creator OAuth does not establish advertiser access.' }
  // A webhook warning or unrelated attention message must not hide a missing linked Page.
  if (account.platform === 'instagram' && typeof account.metadata?.via_page_id === 'string'
    && (!account.linkedFacebookAccountId || account.linkedFacebookIsActive !== true)) {
    return { state: 'external_blocked', reason: 'This Instagram profile no longer has its linked Facebook Page connected for this client.' }
  }
  const health = classifySocialPublishingAccountHealth(account)
  if (!account.isActive || health.requiresReconnect || health.health === 'reconnect') return { state: 'external_blocked', reason: health.healthReason ?? 'Reconnect this account.' }
  const scopes = new Set(Array.isArray(account.metadata?.grantedScopes) ? account.metadata.grantedScopes : [])
  const required = operation === 'organic_comment' || operation === 'inbox_read'
    ? account.platform === 'linkedin'
      ? operation === 'organic_comment' ? 'w_organization_social_feed' : 'r_organization_social_feed'
      : account.platform === 'instagram' ? 'instagram_manage_comments' : account.platform === 'facebook' ? 'pages_manage_engagement' : 'https://www.googleapis.com/auth/business.manage'
    : operation === 'organic_publish'
      ? account.platform === 'linkedin'
        ? account.metadata?.linkedinAuthorType === 'person' ? 'w_member_social' : 'w_organization_social'
        : account.platform === 'tiktok' ? 'video.publish' : account.platform === 'instagram' ? 'instagram_content_publish' : account.platform === 'facebook' ? 'pages_manage_posts' : 'https://www.googleapis.com/auth/business.manage'
      : account.platform === 'linkedin' ? 'r_organization_social' : account.platform === 'instagram' ? 'instagram_manage_insights' : 'read_insights'
  if (!scopes.has(required)) return { state: 'external_blocked', reason: `Actual provider grant ${required} has not been recorded for this account.` }
  return { state: 'available', reason: 'The account has the recorded provider grant required for this operation.' }
}
