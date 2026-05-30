// server/utils/channelMap.ts
/**
 * Single source of truth mapping ad platforms and lead sources onto GA4
 * Default Channel Groups. Used by the funnel endpoints to join spend + leads
 * onto GA4 channel rows. Keep in sync with GA4's sessionDefaultChannelGroup
 * values for paid traffic.
 */

/** media_spend.platform → GA4 channel group, or null if not a paid channel we map. */
export function adPlatformToChannel(platform: string): string | null {
  switch (platform) {
    case 'google_ads':
    case 'google':
      return 'Paid Search'
    case 'meta':
    case 'meta_ads':
      return 'Paid Social'
    default:
      return null
  }
}

/** leads.source → GA4 channel group, or null if not attributable to a paid channel. */
export function leadSourceToChannel(source: string): string | null {
  switch (source) {
    case 'google':
      return 'Paid Search'
    case 'meta':
      return 'Paid Social'
    default:
      return null
  }
}
