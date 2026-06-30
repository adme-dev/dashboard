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

import type { SocialPostProvider, PostParams, PostResult, FetchInboxParams, FetchInboxResult, ReplyParams, ReplyResult } from './types'
import type { InboxItem } from '~~/server/utils/socialInbox/types'

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
  media?: Array<{ mediaFormat: string, sourceUrl: string }>
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
      'reason'?: string
      'domain'?: string
      'metadata'?: Record<string, string>
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
function parseDate(dateStr: string): { year: number, month: number, day: number } {
  const [year, month, day] = dateStr.split('-').map(Number)
  return { year: year ?? 0, month: month ?? 0, day: day ?? 0 }
}

/**
 * Parse a time string (HH:MM) into the Google API TimeOfDay format.
 * @see https://developers.google.com/my-business/reference/rest/Shared.Types/TimeOfDay
 */
function parseTime(timeStr: string): { hours: number, minutes: number } {
  const [hours, minutes] = timeStr.split(':').map(Number)
  return { hours: hours ?? 0, minutes: minutes ?? 0 }
}

/**
 * Build the localPosts API path for a given account and location.
 */
function buildLocalPostsPath(accountId: string, locationId: string): string {
  return `${GBP_API_BASE}/accounts/${accountId}/locations/${locationId}/localPosts`
}

export function buildGoogleBusinessLocationResourceName(accountId: string): string {
  const value = accountId.trim().replace(/^\/+/, '')
  if (/^accounts\/[^/]+\/locations\/[^/]+$/.test(value)) return value

  const [googleBusinessAccountId, googleBusinessLocationId] = value.split(':')
  if (googleBusinessAccountId && googleBusinessLocationId) {
    return `accounts/${encodeURIComponent(googleBusinessAccountId)}/locations/${encodeURIComponent(googleBusinessLocationId)}`
  }

  throw new Error('Google Business account/location could not be resolved for review sync')
}

/**
 * Build the media array for the post body from MediaItem[].
 * GBP supports PHOTO and VIDEO media formats.
 */
function buildMediaItems(
  media: PostParams['media']
): Array<{ mediaFormat: string, sourceUrl: string }> {
  if (!media?.length) return []

  return media.map((item) => {
    const mediaFormat = item.type === 'video' ? 'VIDEO' : 'PHOTO'
    return {
      mediaFormat,
      sourceUrl: item.url
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
          'Google Business Profile requires a locationId in options. '
          + 'Set options.locationId to your GBP location ID.'
        )
      }

      const topicType = gbpOptions.topicType || 'STANDARD'
      const languageCode = gbpOptions.languageCode || 'en'
      const endpoint = buildLocalPostsPath(accountId, gbpOptions.locationId)

      // Build the base post body
      const body: GBPPostBody = {
        languageCode,
        summary: content,
        topicType
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
          url: gbpOptions.callToAction.url
        }
      }

      // Add event fields (required for EVENT and OFFER posts)
      if (gbpOptions.event && (topicType === 'EVENT' || topicType === 'OFFER')) {
        const schedule: GBPEventSchedule = {
          startDate: parseDate(gbpOptions.event.startDate),
          endDate: parseDate(gbpOptions.event.endDate)
        }

        if (gbpOptions.event.startTime) {
          schedule.startTime = parseTime(gbpOptions.event.startTime)
        }
        if (gbpOptions.event.endTime) {
          schedule.endTime = parseTime(gbpOptions.event.endTime)
        }

        body.event = {
          title: gbpOptions.event.title,
          schedule
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
      const res = await $fetch<{ name: string, searchUrl?: string }>(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body
      })

      // Extract the post ID from the resource name
      // Format: accounts/{accountId}/locations/{locationId}/localPosts/{postId}
      const postId = res.name?.split('/').pop() || res.name || ''

      // Build a viewable URL — GBP posts are visible on the business listing
      const postUrl
        = res.searchUrl || `https://business.google.com/posts/l/${gbpOptions.locationId}/${postId}`

      return {
        platformPostId: postId,
        url: postUrl,
        status: 'success'
      }
    } catch (err: unknown) {
      console.error('[Google Business Provider] Post failed:', err)
      return parseGBPError(err)
    }
  }
}

// --- Slice 2 inbox: Google Business reviews ---
const GBP_STAR: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 }

interface GoogleBusinessReview {
  name?: string | null
  reviewId?: string | null
  reviewer?: { displayName?: string | null, profilePhotoUrl?: string | null } | null
  comment?: string | null
  starRating?: string | null
  createTime?: string | null
  reviewReply?: {
    comment?: string | null
    updateTime?: string | null
    reviewReplyState?: string | null
  } | null
}

interface GoogleBusinessReviewListResponse {
  reviews?: GoogleBusinessReview[]
  nextPageToken?: string | null
}

interface GoogleBusinessReplyError {
  error?: {
    message?: string | null
  }
}

/** Pure: map a GBP reviews.list response to InboxItems + next cursor. */
export function mapGoogleReviews(api: GoogleBusinessReviewListResponse): FetchInboxResult {
  const items: InboxItem[] = []
  for (const r of api.reviews ?? []) {
    const platformConversationId = String(r.name ?? r.reviewId ?? '')
    const platformMessageId = String(r.reviewId ?? r.name ?? '')
    items.push({
      channelType: 'review' as const,
      // full resource name (accounts/*/locations/*/reviews/*) so reply() can target it directly
      platformConversationId,
      participant: { name: r.reviewer?.displayName },
      platformMessageId,
      authorName: r.reviewer?.displayName,
      content: r.comment ?? '',
      messageType: 'review',
      metadata: r.reviewer?.profilePhotoUrl ? { authorAvatarUrl: r.reviewer.profilePhotoUrl } : undefined,
      rating: GBP_STAR[r.starRating] ?? undefined,
      platformTimestamp: r.createTime
    })

    if (r.reviewReply?.comment) {
      items.push({
        channelType: 'review',
        platformConversationId,
        participant: {},
        platformMessageId: `${platformMessageId}:reply`,
        parentPlatformMessageId: platformMessageId,
        direction: 'out',
        authorName: 'Owner response',
        content: r.reviewReply.comment,
        messageType: 'review_reply',
        metadata: {
          source: 'platform_sync',
          reviewReplyState: r.reviewReply.reviewReplyState ?? null
        },
        platformTimestamp: r.reviewReply.updateTime ?? undefined
      })
    }
  }
  return { items, nextCursor: api?.nextPageToken ?? null }
}

googleBusinessProvider.fetchInbox = async ({ accountId, accessToken, cursor }: FetchInboxParams): Promise<FetchInboxResult> => {
  const locationResourceName = buildGoogleBusinessLocationResourceName(accountId)
  const url = new URL(`${GBP_API_BASE}/${locationResourceName}/reviews`)
  url.searchParams.set('pageSize', '50')
  if (cursor) url.searchParams.set('pageToken', cursor)
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
  if (!res.ok) throw new Error(`gbp fetchInbox ${res.status}`)
  return mapGoogleReviews(await res.json())
}

googleBusinessProvider.reply = async ({ accessToken, conversationId, content }: ReplyParams): Promise<ReplyResult> => {
  // conversationId = full review resource name; reply endpoint is `.../reviews/{id}/reply` (PUT)
  const res = await fetch(`${GBP_API_BASE}/${conversationId}/reply`, {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ comment: content })
  })
  const j = await res.json().catch((): GoogleBusinessReplyError => ({})) as GoogleBusinessReplyError
  return res.ok
    ? { platformMessageId: String(conversationId), status: 'success' }
    : { platformMessageId: '', status: 'failed', error: j?.error?.message ?? `http ${res.status}` }
}
