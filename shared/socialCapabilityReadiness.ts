/** Provider implementation is distinct from the operations offered by the staff connector. */
export const STAFF_REVIEWED_PUBLISH_PLATFORMS = ['facebook', 'instagram', 'linkedin', 'tiktok'] as const
export type SocialOperation = 'organic_publish' | 'organic_comment' | 'inbox_read' | 'organic_reporting' | 'paid_reporting' | 'paid_mutation'
export type ReadinessState = 'available' | 'code_incomplete' | 'external_blocked' | 'unsupported'
export const SOCIAL_OPERATIONS: SocialOperation[] = ['organic_publish', 'organic_comment', 'inbox_read', 'organic_reporting', 'paid_reporting', 'paid_mutation']
export const TIKTOK_ELIGIBILITY_REASON = 'TikTok publishing is unavailable: actual product eligibility, app audit, granted scopes, verified media property and live acceptance remain unverified. Internal team upload utilities are excluded by TikTok guidelines.'
export function platformPublishingSupport(platform: string): { productionReady: boolean, reason: string } {
  if (platform === 'tiktok') return { productionReady: false, reason: TIKTOK_ELIGIBILITY_REASON }
  if (platform === 'youtube') return { productionReady: false, reason: 'OAuth channel discovery foundation is available; upload publishing, refresh hardening, and live provider smoke remain disabled' }
  if (platform === 'instagram') return { productionReady: true, reason: 'Connects through a linked Facebook Page' }
  if (platform === 'linkedin') return { productionReady: true, reason: 'Ready for Company Page connection (organization admins): publishing, comments inbox, and Page analytics' }
  if (['facebook', 'google-business'].includes(platform)) return { productionReady: true, reason: 'Ready for publishing account connection' }
  return { productionReady: false, reason: 'Unsupported publishing platform' }
}
export function providerOperationSupport(platform: string, operation: SocialOperation): { state: ReadinessState, reason: string } {
  if (operation === 'paid_mutation') return { state: 'unsupported', reason: 'No reviewed staff paid mutation operation is implemented for this provider.' }
  if (operation === 'paid_reporting') return ['facebook', 'instagram', 'linkedin', 'tiktok'].includes(platform)
    ? { state: 'available', reason: 'Existing paid reporting service; requires a separate advertiser connection.' }
    : { state: 'unsupported', reason: 'No paid reporting service for this provider.' }
  if (platform === 'tiktok') return operation === 'organic_publish'
    ? { state: 'external_blocked', reason: TIKTOK_ELIGIBILITY_REASON }
    : { state: 'unsupported', reason: 'No verified TikTok organic engagement/reporting operation is offered.' }
  if (platform === 'google-business' && operation === 'organic_reporting') return { state: 'code_incomplete', reason: 'The Google Business adapter does not implement organic metrics reads.' }
  if (platform === 'google-business' && operation === 'organic_comment') return { state: 'unsupported', reason: 'Google Business review replies do not implement comments on published posts.' }
  const support = platformPublishingSupport(platform)
  if (!support.productionReady) return { state: 'code_incomplete', reason: support.reason }
  return { state: 'available', reason: 'Provider adapter exists; account and staff operation checks are required.' }
}
