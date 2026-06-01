/**
 * Google Business Profile Provider
 *
 * Creates Local Posts on a Google Business Profile location using the
 * My Business API v4. Supports STANDARD, OFFER, and EVENT post types,
 * each with optional media and call-to-action buttons.
 *
 * Reference: https://developers.google.com/my-business/content/posts-data
 * Reference: https://developers.google.com/my-business/reference/rest/v4/accounts.locations.localPosts
 *
 * IMPORTANT: The `accountId` param is the GBP account ID.
 * The `options.locationId` is the specific location within that account.
 * Endpoint format: accounts/{accountId}/locations/{locationId}/localPosts
 */

import type { SocialPostProvider, PostParams, PostResult } from './types'

const GBP_API_BASE = 'https://mybusiness.googleapis.com/v4'

// ── Google Business-specific option types ──────────────────────

interface GBPOptions {
  /** Post topic type (default: 'STANDARD') */
  topicType?: 'STANDARD' | 'OFFER' | 'EVENT'
  /** GBP location ID (required) — the specific location within the account */
  locationId?: string
  /** Call to action button */
  callToAction?: {
    actionType: 'BOOK' | 'ORDER' | 'SHOP' | 'LEARN_MORE' | 'SIGN_UP' | 'CALL'
    url: string
  }
  /** Offer-specific fields (for OFFER posts) */
  offer?: {
    couponCode?: string
    redeemOnlineUrl?: string
    termsConditions?: string
  }
  /** Event-specific fields (for EVENT posts) */
  event?: {
    title: string
    startDate: string // YYYY-MM-DD
    endDate: string // YYYY-MM-DD
    startTime?: string // HH:MM (24h format)
    endTime?: string // HH:MM (24h format)
  }
  /** Language code for the post (default: 'en') */
  languageCode?: string
}

interface GBPEventSchedule {
  startDate: ReturnType<typeof parseDate>
  endDate: ReturnType<typeof parseDate>
  startTime?: ReturnType<typeof parseTime>
  endTime?: ReturnType<typeof parseTime>
}

interface GBPPostBody {
  languageCode: string
  summary: string
  topicType: 'STANDARD' | 'OFFER' | 'EVENT'
  media?: Array<{ mediaFormat: string; sourceUrl: string }>
  callToAction?: {
    actionType: 'BOOK' | 'ORDER' | 'SHOP' | 'LEARN_MORE' | 'SIGN_UP' | 'CALL'
    url: string
  }
  event?: {
    title: string
    schedule: GBPEventSchedule
  }
  offer?: {
    couponCode?: string
    redeemOnlineUrl?: string
    termsConditions?: string
  }
}

// ── Error helpers ──────────────────────────────────────────────

interface GoogleAPIError {
  error?: {
    code?: number
    message?: string
    status?: string
    details?: Array<{
      '@type'?: string
      reason?: string
      domain?: string
      metadata?: Record<string, string>
    }>
  }
}

/**
 * Parse a Google API error into a user-friendly PostResult.
 * Handles token expiration, permission errors, and location not found.
 */
function parseGBPError(err: unknown): PostResult {
  const raw = err as {
    data?: GoogleAPIError
    statusCode?: number
    status?: number
    message?: string
  }
  const apiErr = raw?.data?.error
  const statusCode = raw?.statusCode || raw?.status

  // Token expired or invalid
  if (statusCode === 401) {
    return failResult(
      'Token expired or invalid. Please reconnect your Google Business Profile account.'
    )
  }

  // Insufficient permissions
  if (statusCode === 403) {
    return failResult(
      `Insufficient permissions: ${apiErr?.message || 'Ensure you have owner or manager access to this Business Profile.'}`
    )
  }

  // Location not found
  if (statusCode === 404) {
    return failResult(
      `Location not found: ${apiErr?.message || 'The specified location ID does not exist or is not accessible.'}`
    )
  }

  // Rate limit
  if (statusCode === 429) {
    return failResult('Google Business Profile API rate limit exceeded. Please try again later.')
  }

  // Generic fallback
  const msg = apiErr?.message || raw?.message || 'Unknown Google Business Profile API error'
  return failResult(msg)
}

function failResult(error: string): PostResult {
  return { platformPostId: '', url: '', status: 'failed', error }
}

// ── Internal helpers ───────────────────────────────────────────

/**
 * Parse a date string (YYYY-MM-DD) into the Google API Date object format.
 * @see https://developers.google.com/my-business/reference/rest/Shared.Types/Date_
 */
function parseDate(dateStr: string): { year: number; month: number; day: number } {
  const [year, month, day] = dateStr.split('-').map(Number)
  return { year, month, day }
}

/**
 * Parse a time string (HH:MM) into the Google API TimeOfDay format.
 * @see https://developers.google.com/my-business/reference/rest/Shared.Types/TimeOfDay
 */
function parseTime(timeStr: string): { hours: number; minutes: number } {
  const [hours, minutes] = timeStr.split(':').map(Number)
  return { hours, minutes }
}

/**
 * Build the localPosts API path for a given account and location.
 */
function buildLocalPostsPath(accountId: string, locationId: string): string {
  return `${GBP_API_BASE}/accounts/${accountId}/locations/${locationId}/localPosts`
}

/**
 * Build the media array for the post body from MediaItem[].
 * GBP supports PHOTO and VIDEO media formats.
 */
function buildMediaItems(
  media: PostParams['media']
): Array<{ mediaFormat: string; sourceUrl: string }> {
  if (!media?.length) return []

  return media.map(item => {
    const mediaFormat = item.type === 'video' ? 'VIDEO' : 'PHOTO'
    return {
      mediaFormat,
      sourceUrl: item.url,
    }
  })
}

// ── Provider implementation ────────────────────────────────────

/**
 * Google Business Profile social media provider.
 *
 * Creates Local Posts (standard, offer, or event) on a GBP location.
 * Posts appear directly on the business listing in Google Search and Maps.
 *
 * @example
 * ```ts
 * // Standard post with image and CTA
 * const result = await googleBusinessProvider.post({
 *   accountId: '123456789',              // GBP account ID
 *   accessToken: 'ya29.xxx',
 *   content: 'New 2025 models have arrived!',
 *   media: [{ url: 'https://r2.example.com/hero.jpg', type: 'image' }],
 *   options: {
 *     locationId: '987654321',           // GBP location ID (required)
 *     callToAction: { actionType: 'LEARN_MORE', url: 'https://dealer.com/new-arrivals' },
 *   },
 * })
 *
 * // Offer post
 * const result = await googleBusinessProvider.post({
 *   accountId: '123456789',
 *   accessToken: 'ya29.xxx',
 *   content: 'Summer sale — save up to $5,000 on selected models!',
 *   options: {
 *     locationId: '987654321',
 *     topicType: 'OFFER',
 *     event: { title: 'Summer Clearance Sale', startDate: '2026-01-01', endDate: '2026-02-28' },
 *     offer: { couponCode: 'SUMMER5K', redeemOnlineUrl: 'https://dealer.com/offers' },
 *   },
 * })
 * ```
 */
export const googleBusinessProvider: SocialPostProvider = {
  identifier: 'google-business',
  name: 'Google Business Profile',

  async post(params: PostParams): Promise<PostResult> {
    const { accountId, accessToken, content, media, options = {} } = params
    const gbpOptions = options as GBPOptions

    try {
      // Validate locationId — required for GBP posts
      if (!gbpOptions.locationId) {
        return failResult(
          'Google Business Profile requires a locationId in options. ' +
            'Set options.locationId to your GBP location ID.'
        )
      }

      const topicType = gbpOptions.topicType || 'STANDARD'
      const languageCode = gbpOptions.languageCode || 'en'
      const endpoint = buildLocalPostsPath(accountId, gbpOptions.locationId)

      // Build the base post body
      const body: GBPPostBody = {
        languageCode,
        summary: content,
        topicType,
      }

      // Add media (photos/videos)
      const mediaItems = buildMediaItems(media)
      if (mediaItems.length > 0) {
        body.media = mediaItems
      }

      // Add call to action
      if (gbpOptions.callToAction) {
        body.callToAction = {
          actionType: gbpOptions.callToAction.actionType,
          url: gbpOptions.callToAction.url,
        }
      }

      // Add event fields (required for EVENT and OFFER posts)
      if (gbpOptions.event && (topicType === 'EVENT' || topicType === 'OFFER')) {
        const schedule: GBPEventSchedule = {
          startDate: parseDate(gbpOptions.event.startDate),
          endDate: parseDate(gbpOptions.event.endDate),
        }

        if (gbpOptions.event.startTime) {
          schedule.startTime = parseTime(gbpOptions.event.startTime)
        }
        if (gbpOptions.event.endTime) {
          schedule.endTime = parseTime(gbpOptions.event.endTime)
        }

        body.event = {
          title: gbpOptions.event.title,
          schedule,
        }
      }

      // Add offer-specific fields
      if (gbpOptions.offer && topicType === 'OFFER') {
        body.offer = {}
        if (gbpOptions.offer.couponCode) {
          body.offer.couponCode = gbpOptions.offer.couponCode
        }
        if (gbpOptions.offer.redeemOnlineUrl) {
          body.offer.redeemOnlineUrl = gbpOptions.offer.redeemOnlineUrl
        }
        if (gbpOptions.offer.termsConditions) {
          body.offer.termsConditions = gbpOptions.offer.termsConditions
        }
      }

      // Create the local post
      const res = await $fetch<{ name: string; searchUrl?: string }>(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body,
      })

      // Extract the post ID from the resource name
      // Format: accounts/{accountId}/locations/{locationId}/localPosts/{postId}
      const postId = res.name?.split('/').pop() || res.name || ''

      // Build a viewable URL — GBP posts are visible on the business listing
      const postUrl =
        res.searchUrl || `https://business.google.com/posts/l/${gbpOptions.locationId}/${postId}`

      return {
        platformPostId: postId,
        url: postUrl,
        status: 'success',
      }
    } catch (err: unknown) {
      console.error('[Google Business Provider] Post failed:', err)
      return parseGBPError(err)
    }
  },
}
