// server/utils/channelMap.ts
/**
 * Single source of truth mapping ad platforms and lead sources onto GA4
 * Default Channel Groups. Used by the funnel endpoints to join spend + leads
 * onto GA4 channel rows. Keep in sync with GA4's sessionDefaultChannelGroup
 * values for paid traffic.
 */

/** media_spend.platform → GA4 channel group, or null if not mapped. */
export function adPlatformToChannel(platform: string): string | null {
  if (!platform) return null

  switch (platform) {
    case 'google':
    case 'google_ads':
      return 'Paid Search'
    case 'microsoft_ads':
      return 'Paid Search'
    case 'linkedin':
    case 'pinterest':
    case 'snapchat':
    case 'twitter':
    case 'tiktok':
      return 'Paid Social'
    case 'meta':
    case 'meta_ads':
      return 'Paid Social'
    case 'programmatic':
      return 'Display'
    case 'traditional':
      return 'Traditional'
    default:
      return null
  }
}

/** leads.source → GA4 channel group, or null if not attributable to a paid channel. */
export function leadSourceToChannel(source: string): string | null {
  if (!source) return null

  switch (source) {
    case 'google':
      return 'Paid Search'
    case 'meta':
      return 'Paid Social'
    case 'manual':
      return 'Direct'
    default:
      return null
  }
}
