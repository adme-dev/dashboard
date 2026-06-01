/**
 * Social Media Provider Interface & Types
 *
 * Common interface that all platform providers implement (Facebook, Instagram, TikTok, etc.)
 * Providers are registered in registry.ts and used by the Post API endpoints.
 */

import type { InboxItem } from '~~/server/utils/socialInbox/types'

export interface SocialPostProvider {
  /** Platform identifier: 'facebook', 'instagram', 'tiktok', 'linkedin', 'youtube', 'google-business' */
  identifier: string
  /** Human-readable platform name */
  name: string

  /** Post content to the platform */
  post(params: PostParams): Promise<PostResult>

  /** Optional: post a comment/reply on an existing post */
  comment?(params: CommentParams): Promise<PostResult>

  /** Optional: pull new comments/reviews since a cursor (poll path — Slice 2 inbox). */
  fetchInbox?(params: FetchInboxParams): Promise<FetchInboxResult>

  /** Optional: post a reply to a comment/review thread. Returns the platform id of the reply. */
  reply?(params: ReplyParams): Promise<ReplyResult>

  /** Optional: fetch lifetime insights for published posts (Slice 3 reporting). */
  fetchPostMetrics?(params: FetchPostMetricsParams): Promise<PostMetric[]>

  /** Optional: fetch current account-level metrics (followers/reach) (Slice 3 reporting). */
  fetchAccountMetrics?(params: FetchAccountMetricsParams): Promise<AccountMetric>
}

/** Slice 3: fetch per-post insights. `posts` maps our post id → the platform's post id. */
export interface FetchPostMetricsParams {
  accountId: string
  accessToken: string
  posts: Array<{ postId: string; platformPostId: string }>
}

/** Normalized per-post metric snapshot (current lifetime totals). */
export interface PostMetric {
  postId: string
  platformPostId: string
  impressions?: number
  reach?: number
  engagements?: number
  clicks?: number
  likes?: number
  commentsCount?: number
  shares?: number
  saves?: number
  videoViews?: number
  reactions?: number
}

export interface FetchAccountMetricsParams {
  accountId: string
  accessToken: string
}

/** Normalized account-level metric snapshot. */
export interface AccountMetric {
  followers?: number
  reach?: number
  impressions?: number
  profileViews?: number
}

/** Slice 2 inbox: poll a provider for new engagement since a cursor. */
export interface FetchInboxParams {
  accountId: string
  accessToken: string
  /** opaque cursor from the last sync (page token / ISO ts / last id) */
  cursor?: string | null
}

export interface FetchInboxResult {
  items: InboxItem[]
  /** cursor to persist for the next sync */
  nextCursor?: string | null
}

export interface ReplyParams {
  accountId: string
  accessToken: string
  /** resolved reply target: comment id (comment) / object id (review/mention) / participant PSID (dm) */
  conversationId: string
  content: string
  /** channel being replied on — providers branch DMs (Send API) vs comments (graph comments edge). */
  channelType?: 'comment' | 'dm' | 'mention' | 'review'
  /** linked Page id for an IG DM send (IG messaging routes through the connected Page). */
  viaPageId?: string
}

export interface ReplyResult {
  platformMessageId: string
  status: 'success' | 'failed'
  error?: string
}

export interface PostParams {
  /** Platform account/page ID (e.g., Facebook Page ID) */
  accountId: string
  /** OAuth access token */
  accessToken: string
  /** Post text/caption */
  content: string
  /** Images/videos (R2 public URLs) */
  media?: MediaItem[]
  /** Platform-specific options (e.g., { type: 'reel' } for Instagram) */
  options?: Record<string, unknown>
}

export interface CommentParams {
  accountId: string
  accessToken: string
  /** Platform post ID to reply to */
  postId: string
  content: string
  media?: MediaItem[]
}

export interface PostResult {
  /** ID returned by the platform */
  platformPostId: string
  /** Direct URL to the published post */
  url: string
  status: 'success' | 'failed'
  error?: string
}

export interface MediaItem {
  /** Public URL (R2 or external) */
  url: string
  type: 'image' | 'video'
  alt?: string
  mimeType?: string
}

/** Platform content limits */
export interface PlatformLimits {
  maxTextLength: number
  maxImages: number
  maxVideoSizeMB: number
  supportedMediaTypes: string[]
  supportsCarousel: boolean
  supportsReels: boolean
  supportsStories: boolean
}
