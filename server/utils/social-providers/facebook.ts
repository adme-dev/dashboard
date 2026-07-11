/**
 * Facebook Pages Provider
 *
 * Posts content to Facebook Pages using the Meta Graph API v20.0.
 * Supports text posts, photo posts (single & carousel), video/Reels, link posts, and comments.
 *
 * Reference: https://developers.facebook.com/docs/pages-api/posts
 * Reference: https://developers.facebook.com/docs/video-api/guides/reels-publishing
 */

import type { SocialPostProvider, PostParams, PostResult, CommentParams, FetchInboxParams, FetchInboxResult, ReplyParams, ReplyResult, FetchPostMetricsParams, PostMetric, FetchAccountMetricsParams, AccountMetric } from './types'
import type { InboxItem } from '~~/server/utils/socialInbox/types'
import { mapFbPostInsights, mapFbAccountInsights } from '~~/server/utils/socialReporting/normalize'
import { fetchWithTimeout, providerFetch } from './http'

const GRAPH_API_BASE = 'https://graph.facebook.com/v25.0'
const INBOX_FETCH_TIMEOUT_MS = 12_000
type SourcePostMetadata = NonNullable<NonNullable<InboxItem['metadata']>['sourcePost']>
type JsonObject = Record<string, unknown>

interface FacebookActor {
  id?: unknown
  name?: unknown
  picture?: unknown
}

interface FacebookCommentNode {
  id?: unknown
  permalink_url?: unknown
  from?: FacebookActor
  message?: unknown
  created_time?: unknown
  like_count?: unknown
  comment_count?: unknown
  comments?: { data?: FacebookCommentNode[] }
  replies?: { data?: FacebookCommentNode[] }
}

interface FacebookPostAttachment {
  media?: {
    image?: { src?: unknown }
    source?: unknown
  }
  type?: unknown
  title?: unknown
  description?: unknown
  url?: unknown
}

interface FacebookFeedPost {
  id?: unknown
  message?: unknown
  full_picture?: unknown
  permalink_url?: unknown
  attachments?: { data?: FacebookPostAttachment[] }
  comments?: { data?: FacebookCommentNode[] }
}

interface FacebookRatingNode {
  open_graph_story?: { id?: unknown }
  reviewer?: FacebookActor
  created_time?: unknown
  review_text?: unknown
  recommendation_type?: unknown
}

interface FacebookRatingsResponse {
  data?: FacebookRatingNode[]
  paging?: { cursors?: { after?: string | null } }
}

interface FacebookFeedResponse {
  data?: FacebookFeedPost[]
}

// ── Error helpers ──────────────────────────────────────────────

interface GraphAPIError {
  error?: {
    message?: string
    type?: string
    code?: number
    error_subcode?: number
    fbtrace_id?: string
  }
}

function parseGraphError(err: unknown): PostResult {
  const raw = err as { data?: GraphAPIError, statusCode?: number, message?: string }
  const graphErr = raw?.data?.error

  // Rate limit
  if (
    raw?.statusCode === 429
    || graphErr?.code === 4
    || graphErr?.code === 32
    || (graphErr?.type === 'OAuthException' && graphErr?.message?.toLowerCase().includes('rate'))
  ) {
    return failResult('Rate limit exceeded. Please wait and try again later.')
  }

  // Token expired / invalid
  if (raw?.statusCode === 401 || graphErr?.code === 190) {
    return failResult('Token expired or invalid. Please reconnect your Facebook account.')
  }

  // Content policy violations
  if (graphErr?.error_subcode === 1346003 || graphErr?.error_subcode === 1404102) {
    return failResult(
      `Content policy violation: ${graphErr?.message || 'Your post was flagged by Facebook\'s content policies.'}`
    )
  }

  // Photo too large
  if (graphErr?.error_subcode === 1366046) {
    return failResult('Photo file is too large. Please use an image under 10 MB.')
  }

  // Generic fallback
  const msg = graphErr?.message || raw?.message || 'Unknown Facebook API error'
  return failResult(msg)
}

function failResult(error: string): PostResult {
  return { platformPostId: '', url: '', status: 'failed', error }
}

// ── Internal helpers ───────────────────────────────────────────

/**
 * Upload a single photo to a Facebook Page as unpublished.
 * Returns the photo ID for use in attached_media.
 */
async function uploadUnpublishedPhoto(
  pageId: string,
  accessToken: string,
  imageUrl: string
): Promise<string> {
  const res = await providerFetch<{ id: string }>(`${GRAPH_API_BASE}/${pageId}/photos`, {
    method: 'POST',
    body: {
      url: imageUrl,
      published: false,
      access_token: accessToken
    }
  })
  return res.id
}

/**
 * Build the Facebook post URL from the page ID and post ID.
 * Graph API returns IDs in format "pageId_postId".
 */
function buildPostUrl(rawId: string): string {
  const parts = rawId.split('_')
  if (parts.length === 2) {
    return `https://www.facebook.com/${parts[0]}/posts/${parts[1]}`
  }
  return `https://www.facebook.com/${rawId}`
}

function readText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const text = value.trim()
  return text.length ? text : undefined
}

function readNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value)
  return undefined
}

function readObject(value: unknown): JsonObject | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : undefined
}

function firstLine(value: unknown): string | undefined {
  const text = readText(value)
  if (!text) return undefined
  return text.split(/\r?\n/).map(line => line.trim()).find(Boolean)?.slice(0, 160)
}

function firstAttachment(post: FacebookFeedPost): FacebookPostAttachment | undefined {
  return Array.isArray(post?.attachments?.data) ? post.attachments.data.find(Boolean) : undefined
}

function facebookPostImage(post: FacebookFeedPost): string | undefined {
  const attachment = firstAttachment(post)
  return readText(post?.full_picture)
    ?? readText(attachment?.media?.image?.src)
    ?? readText(attachment?.media?.source)
}

function facebookSourcePost(post: FacebookFeedPost): SourcePostMetadata | undefined {
  const attachment = firstAttachment(post)
  const id = readText(post?.id)
  const text = readText(post?.message) ?? readText(attachment?.description)
  const title = firstLine(attachment?.title) ?? firstLine(text)
  const imageUrl = facebookPostImage(post)
  const permalink = readText(post?.permalink_url) ?? readText(attachment?.url)
  const mediaType = readText(attachment?.type)
  if (!id && !title && !text && !imageUrl && !permalink) return undefined

  const sourcePost: SourcePostMetadata = { platform: 'facebook' }
  if (id) sourcePost.id = id
  if (title) sourcePost.title = title
  if (text) sourcePost.text = text
  if (imageUrl) sourcePost.imageUrl = imageUrl
  if (mediaType) sourcePost.mediaType = mediaType
  if (permalink) sourcePost.permalink = permalink
  return sourcePost
}

function withSourcePost(
  metadata: InboxItem['metadata'] | undefined,
  sourcePost: SourcePostMetadata | undefined
): InboxItem['metadata'] | undefined {
  return sourcePost && Object.keys(sourcePost).length
    ? { ...(metadata ?? {}), sourcePost }
    : metadata
}

function facebookAuthorAvatar(from: FacebookActor | undefined): string | undefined {
  const picture = readObject(from?.picture)
  const pictureData = readObject(picture?.data)
  return readText(pictureData?.url)
    ?? readText(picture?.url)
    ?? readText(from?.picture)
}

function facebookCommentMetadata(raw: FacebookCommentNode, sourcePost: SourcePostMetadata | undefined, seed?: InboxItem['metadata']): InboxItem['metadata'] | undefined {
  const metadata: InboxItem['metadata'] = { ...(seed ?? {}) }
  const authorAvatarUrl = facebookAuthorAvatar(raw?.from)
  const likeCount = readNumber(raw?.like_count)
  const replyCount = readNumber(raw?.comment_count)
  if (authorAvatarUrl) metadata.authorAvatarUrl = authorAvatarUrl
  if (likeCount != null) metadata.likeCount = likeCount
  if (replyCount != null) metadata.replyCount = replyCount
  return withSourcePost(Object.keys(metadata).length ? metadata : undefined, sourcePost)
}

// ── Provider implementation ────────────────────────────────────

/** Facebook Pages social media provider using Meta Graph API v20.0 */
export const facebookProvider: SocialPostProvider = {
  identifier: 'facebook',
  name: 'Facebook',

  async post(params: PostParams): Promise<PostResult> {
    const { accountId, accessToken, content, media, options } = params

    try {
      // ── Link post ────────────────────────────────────
      if (options?.link && !media?.length) {
        const res = await providerFetch<{ id: string }>(`${GRAPH_API_BASE}/${accountId}/feed`, {
          method: 'POST',
          body: {
            message: content,
            link: options.link,
            access_token: accessToken
          }
        })
        return {
          platformPostId: res.id,
          url: buildPostUrl(res.id),
          status: 'success'
        }
      }

      // ── No media: text-only post ─────────────────────
      if (!media?.length) {
        const res = await providerFetch<{ id: string }>(`${GRAPH_API_BASE}/${accountId}/feed`, {
          method: 'POST',
          body: {
            message: content,
            access_token: accessToken
          }
        })
        return {
          platformPostId: res.id,
          url: buildPostUrl(res.id),
          status: 'success'
        }
      }

      // ── Video post (Reels) ───────────────────────────
      const videos = media.filter(m => m.type === 'video')
      if (videos.length > 0) {
        const video = videos[0]!
        const res = await providerFetch<{ id: string }>(`${GRAPH_API_BASE}/${accountId}/videos`, {
          method: 'POST',
          body: {
            file_url: video.url,
            description: content,
            access_token: accessToken
          }
        })
        return {
          platformPostId: res.id,
          url: `https://www.facebook.com/${accountId}/videos/${res.id}`,
          status: 'success'
        }
      }

      // ── Single photo post ────────────────────────────
      const images = media.filter(m => m.type === 'image')
      if (images.length === 1) {
        // Upload as unpublished, then attach to a feed post for consistent URL format
        const photoId = await uploadUnpublishedPhoto(accountId, accessToken, images[0]!.url)

        const res = await providerFetch<{ id: string }>(`${GRAPH_API_BASE}/${accountId}/feed`, {
          method: 'POST',
          body: {
            message: content,
            attached_media: [{ media_fbid: photoId }],
            access_token: accessToken
          }
        })

        return {
          platformPostId: res.id,
          url: buildPostUrl(res.id),
          status: 'success'
        }
      }

      // ── Multi-photo carousel post ────────────────────
      if (images.length > 1) {
        // Upload all photos as unpublished in parallel
        const photoIds = await Promise.all(
          images.map(img => uploadUnpublishedPhoto(accountId, accessToken, img.url))
        )

        const attachedMedia = photoIds.map(id => ({ media_fbid: id }))

        const res = await providerFetch<{ id: string }>(`${GRAPH_API_BASE}/${accountId}/feed`, {
          method: 'POST',
          body: {
            message: content,
            attached_media: attachedMedia,
            access_token: accessToken
          }
        })

        return {
          platformPostId: res.id,
          url: buildPostUrl(res.id),
          status: 'success'
        }
      }

      return failResult('Unsupported media combination')
    } catch (err: unknown) {
      console.error('[Facebook Provider] Post failed:', err)
      return parseGraphError(err)
    }
  },

  async comment(params: CommentParams): Promise<PostResult> {
    const { accessToken, postId, content } = params

    try {
      const res = await providerFetch<{ id: string }>(`${GRAPH_API_BASE}/${postId}/comments`, {
        method: 'POST',
        body: {
          message: content,
          access_token: accessToken
        }
      })

      return {
        platformPostId: res.id,
        url: `https://www.facebook.com/${postId}`,
        status: 'success'
      }
    } catch (err: unknown) {
      console.error('[Facebook Provider] Comment failed:', err)
      return parseGraphError(err)
    }
  }
}

// --- Slice 2 inbox: Facebook recommendations (reviews) ---
/** Pure: map a Facebook page `ratings` edge response to InboxItems + next cursor. */
export function mapFacebookRatings(api: unknown): FetchInboxResult {
  const payload = api as FacebookRatingsResponse | undefined
  const items: InboxItem[] = (payload?.data ?? []).map((r) => {
    const reviewerId = readText(r.reviewer?.id)
    const reviewerName = readText(r.reviewer?.name)
    const storyId = readText(r.open_graph_story?.id)
    const createdTime = readText(r.created_time)
    const recommendationType = readText(r.recommendation_type)

    return {
      channelType: 'review' as const,
      platformConversationId: storyId ?? reviewerId ?? '',
      participant: { id: reviewerId, name: reviewerName },
      platformMessageId: storyId ?? [reviewerId, createdTime].filter(Boolean).join('_'),
      authorName: reviewerName,
      content: readText(r.review_text) ?? '',
      messageType: 'review',
      rating: recommendationType === 'positive' ? 5 : recommendationType === 'negative' ? 1 : undefined,
      platformTimestamp: createdTime
    }
  })
  return { items, nextCursor: payload?.paging?.cursors?.after ?? null }
}

/** Pure: map a Facebook page feed response with nested comments to InboxItems. */
export function mapFacebookFeedComments(api: unknown, opts: { accountId?: string } = {}): FetchInboxResult {
  const payload = api as FacebookFeedResponse | undefined
  const items: InboxItem[] = []
  for (const post of payload?.data ?? []) {
    const postId = readText(post?.id) ?? ''
    if (!postId) continue
    const sourcePost = facebookSourcePost(post)
    for (const c of post?.comments?.data ?? []) {
      const commentId = readText(c?.id) ?? ''
      if (!commentId) continue
      const authorId = readText(c?.from?.id)
      const authorName = readText(c?.from?.name)
      items.push({
        channelType: 'comment',
        platformConversationId: postId,
        permalink: readText(c?.permalink_url) ?? readText(post?.permalink_url),
        participant: { id: authorId, name: authorName },
        platformMessageId: commentId,
        authorId,
        authorName,
        content: readText(c?.message) ?? '',
        messageType: 'comment',
        metadata: facebookCommentMetadata(c, sourcePost),
        platformTimestamp: readText(c?.created_time)
      })

      const replies = c?.comments?.data ?? c?.replies?.data ?? []
      for (const reply of replies) {
        const replyId = readText(reply?.id) ?? ''
        if (!replyId) continue
        const replyAuthorId = readText(reply?.from?.id)
        const replyAuthorName = readText(reply?.from?.name)
        const isPageReply = Boolean(opts.accountId && replyAuthorId === opts.accountId)
        items.push({
          channelType: 'comment',
          platformConversationId: postId,
          permalink: readText(reply?.permalink_url) ?? readText(c?.permalink_url) ?? readText(post?.permalink_url),
          participant: { id: replyAuthorId, name: replyAuthorName },
          platformMessageId: replyId,
          parentPlatformMessageId: commentId,
          direction: isPageReply ? 'out' : 'in',
          authorId: replyAuthorId,
          authorName: replyAuthorName,
          content: readText(reply?.message) ?? '',
          messageType: 'comment_reply',
          metadata: facebookCommentMetadata(reply, sourcePost, { source: 'platform_sync' }),
          platformTimestamp: readText(reply?.created_time)
        })
      }
    }
  }
  // The feed cursor paginates posts, not comments. Keep comment polling anchored to the newest
  // posts and let social_messages idempotency absorb duplicates between cron/manual syncs.
  return { items, nextCursor: null }
}

facebookProvider.fetchInbox = async ({ accountId, accessToken, cursor, channelType }: FetchInboxParams): Promise<FetchInboxResult> => {
  if (channelType === 'comment') {
    const url = new URL(`${GRAPH_API_BASE}/${accountId}/feed`)
    url.searchParams.set('fields', 'id,message,permalink_url,full_picture,attachments{media,type,title,description,url},comments.limit(50){id,message,from{id,name,picture},created_time,permalink_url,like_count,comment_count,comments.limit(50){id,message,from{id,name,picture},created_time,permalink_url,like_count,comment_count}}')
    url.searchParams.set('access_token', accessToken)
    url.searchParams.set('limit', '25')
    const res = await fetchWithTimeout(url, { timeoutMs: INBOX_FETCH_TIMEOUT_MS })
    if (!res.ok) throw new Error(`facebook comments fetchInbox ${res.status}`)
    return mapFacebookFeedComments(await res.json(), { accountId })
  }

  // Reviews (recommendations). Page comments also have a polling fallback above because webhooks
  // can be unavailable during app-review/subscription gaps.
  const url = new URL(`${GRAPH_API_BASE}/${accountId}/ratings`)
  url.searchParams.set('fields', 'reviewer{id,name},review_text,recommendation_type,created_time,open_graph_story')
  url.searchParams.set('access_token', accessToken)
  url.searchParams.set('limit', '50')
  if (cursor) url.searchParams.set('after', cursor)
  const res = await fetchWithTimeout(url, { timeoutMs: INBOX_FETCH_TIMEOUT_MS })
  if (!res.ok) throw new Error(`facebook fetchInbox ${res.status}`)
  return mapFacebookRatings(await res.json())
}

// --- Slice 2d: Messenger DM send (App-Review-gated) ---
/** Pure: build the Messenger Send API request for a DM reply. recipientId = participant PSID. */
export function buildMessengerSend(pageId: string, recipientId: string, content: string, accessToken: string) {
  return {
    url: `${GRAPH_API_BASE}/${pageId}/messages`,
    body: {
      recipient: { id: recipientId },
      message: { text: content },
      messaging_type: 'RESPONSE',
      access_token: accessToken
    }
  }
}

facebookProvider.reply = async ({ accountId, accessToken, conversationId, content, channelType }: ReplyParams): Promise<ReplyResult> => {
  // DM: send via the Messenger Send API to the participant PSID (conversationId). Otherwise the
  // conversationId is a comment/object id and we post a comment on it.
  if (channelType === 'dm') {
    const { url, body } = buildMessengerSend(accountId, conversationId, content, accessToken)
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const j: JsonObject = await res.json().catch(() => ({}))
    return res.ok && j.message_id
      ? { platformMessageId: String(j.message_id), status: 'success' }
      : { platformMessageId: '', status: 'failed', error: readText(readObject(j.error)?.message) ?? `http ${res.status}` }
  }
  // conversationId = the comment id (from webhook) or object id; reply posts a comment on it.
  const res = await fetch(`${GRAPH_API_BASE}/${conversationId}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: content, access_token: accessToken })
  })
  const j: JsonObject = await res.json().catch(() => ({}))
  return res.ok && j.id
    ? { platformMessageId: String(j.id), status: 'success' }
    : { platformMessageId: '', status: 'failed', error: readText(readObject(j.error)?.message) ?? `http ${res.status}` }
}

// --- Slice 3 reporting: organic metrics collection ---
// ⚠️ Insight metric names follow Graph v20 docs; verify live before relying on prod numbers.
facebookProvider.fetchPostMetrics = async ({ accessToken, posts }: FetchPostMetricsParams): Promise<PostMetric[]> => {
  const out: PostMetric[] = []
  for (const p of posts) {
    try {
      const tok = encodeURIComponent(accessToken)
      const insRes = await fetch(`${GRAPH_API_BASE}/${p.platformPostId}/insights?metric=post_impressions,post_impressions_unique,post_clicks,post_video_views,post_reactions_by_type_total&access_token=${tok}`)
      const ins: JsonObject = await insRes.json().catch(() => ({}))
      // comments/shares aren't insight metrics — read them off the post object.
      const fldRes = await fetch(`${GRAPH_API_BASE}/${p.platformPostId}?fields=comments.summary(true).limit(0),shares&access_token=${tok}`)
      const fld: JsonObject = await fldRes.json().catch(() => ({}))
      const comments = readObject(fld.comments)
      const commentSummary = readObject(comments?.summary)
      const shares = readObject(fld.shares)
      out.push(mapFbPostInsights(p.postId, p.platformPostId, ins, {
        comments: readNumber(commentSummary?.total_count), shares: readNumber(shares?.count)
      }))
    } catch { /* skip this post; others still collect */ }
  }
  return out
}

facebookProvider.fetchAccountMetrics = async ({ accountId, accessToken }: FetchAccountMetricsParams): Promise<AccountMetric> => {
  const tok = encodeURIComponent(accessToken)
  const insRes = await fetch(`${GRAPH_API_BASE}/${accountId}/insights?metric=page_impressions,page_impressions_unique,page_views_total&period=day&access_token=${tok}`)
  const ins: JsonObject = await insRes.json().catch(() => ({}))
  const pageRes = await fetch(`${GRAPH_API_BASE}/${accountId}?fields=fan_count&access_token=${tok}`)
  const page: JsonObject = await pageRes.json().catch(() => ({}))
  return mapFbAccountInsights(ins, readNumber(page.fan_count))
}
