/**
 * Instagram Provider
 *
 * Posts content to Instagram using the Container-based publishing flow
 * via the Meta Graph API v20.0.
 *
 * Publishing flow:
 *   1. Create media container(s)
 *   2. (For video) Poll container status until FINISHED
 *   3. Publish the container
 *
 * Supports: single image, single video/Reel, carousel, and Stories.
 *
 * Reference: https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/content-publishing
 */

import type { SocialPostProvider, PostParams, PostResult, CommentParams, MediaItem, ReplyParams, ReplyResult, FetchInboxParams, FetchInboxResult, FetchPostMetricsParams, PostMetric, FetchAccountMetricsParams, AccountMetric } from './types'
import type { InboxItem } from '~~/server/utils/socialInbox/types'
import { buildMessengerSend } from './facebook'
import { mapIgMediaInsights, mapIgAccountInsights } from '~~/server/utils/socialReporting/normalize'
import { fetchWithTimeout, providerFetch } from './http'

const GRAPH_API_BASE = 'https://graph.facebook.com/v25.0'
const INBOX_FETCH_TIMEOUT_MS = 12_000
type SourcePostMetadata = NonNullable<NonNullable<InboxItem['metadata']>['sourcePost']>
type JsonObject = Record<string, unknown>

interface InstagramActor {
  id?: unknown
  username?: unknown
}

interface InstagramCommentNode {
  id?: unknown
  text?: unknown
  username?: unknown
  timestamp?: unknown
  permalink_url?: unknown
  like_count?: unknown
  reply_count?: unknown
  from?: InstagramActor
  replies?: { data?: InstagramCommentNode[] }
}

interface InstagramMediaNode {
  id?: unknown
  permalink?: unknown
  caption?: unknown
  media_type?: unknown
  media_url?: unknown
  thumbnail_url?: unknown
  comments?: { data?: InstagramCommentNode[] }
}

interface InstagramMediaResponse {
  data?: InstagramMediaNode[]
}

/** Max time (ms) to wait for video container processing */
const VIDEO_POLL_TIMEOUT_MS = 60_000
/** Interval (ms) between container status checks */
const VIDEO_POLL_INTERVAL_MS = 2_000

// ── Error helpers ──────────────────────────────────────────────

interface GraphAPIError {
  error?: {
    message?: string
    type?: string
    code?: number
    error_subcode?: number
  }
}

interface InstagramPostOptions {
  type?: 'post' | 'reel' | 'story'
  collaborators?: string[]
  link?: string
}

interface InstagramContainerBody {
  access_token: string
  is_carousel_item?: boolean
  image_url?: string
  video_url?: string
  media_type?: 'REELS' | 'CAROUSEL' | 'STORIES'
  alt_text?: string
  caption?: string
  collaborators?: string
  children?: string
}

function parseGraphError(err: unknown): PostResult {
  const raw = err as { data?: GraphAPIError, statusCode?: number, message?: string }
  const graphErr = raw?.data?.error

  // Rate limit
  if (raw?.statusCode === 429 || graphErr?.code === 4 || graphErr?.code === 32) {
    return failResult('Rate limit exceeded. Please wait and try again later.')
  }

  // Token expired / invalid
  if (raw?.statusCode === 401 || graphErr?.code === 190) {
    return failResult('Token expired or invalid. Please reconnect your Instagram account.')
  }

  // Content policy
  if (graphErr?.error_subcode === 1346003 || graphErr?.error_subcode === 1404102) {
    return failResult(
      `Content policy violation: ${graphErr?.message || 'Your post was flagged by Instagram\'s content policies.'}`
    )
  }

  // Media format errors
  if (graphErr?.code === 36003) {
    return failResult(
      `Media format error: ${graphErr?.message || 'The media format is not supported.'}`
    )
  }

  const msg = graphErr?.message || raw?.message || 'Unknown Instagram API error'
  return failResult(msg)
}

function failResult(error: string): PostResult {
  return { platformPostId: '', url: '', status: 'failed', error }
}

function readNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value)
  return undefined
}

function readObject(value: unknown): JsonObject | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : undefined
}

// ── Helpers ────────────────────────────────────────────────────

/**
 * Wait for an Instagram media container to finish processing (video upload).
 * Polls every 2 seconds, up to 60 seconds by default.
 */
async function waitForContainerReady(
  containerId: string,
  accessToken: string,
  timeoutMs: number = VIDEO_POLL_TIMEOUT_MS
): Promise<{ ready: boolean, error?: string }> {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const res = await providerFetch<{ status_code: string, status?: string }>(
      `${GRAPH_API_BASE}/${containerId}`,
      {
        method: 'GET',
        params: {
          fields: 'status_code,status',
          access_token: accessToken
        }
      }
    )

    const status = res.status_code?.toUpperCase()

    if (status === 'FINISHED') {
      return { ready: true }
    }

    if (status === 'ERROR') {
      return {
        ready: false,
        error: `Container processing failed: ${res.status || 'Unknown error'}`
      }
    }

    if (status === 'EXPIRED') {
      return {
        ready: false,
        error: 'Container expired before it could be published. Please try again.'
      }
    }

    // IN_PROGRESS or other transient states — wait and retry
    await new Promise(resolve => setTimeout(resolve, VIDEO_POLL_INTERVAL_MS))
  }

  return { ready: false, error: `Video processing timed out after ${timeoutMs / 1000} seconds.` }
}

/**
 * Create an individual media container (image or video).
 * Returns the container ID.
 */
async function createItemContainer(
  accountId: string,
  accessToken: string,
  item: MediaItem,
  options?: { isCarouselItem?: boolean }
): Promise<string> {
  const body: InstagramContainerBody = {
    access_token: accessToken,
    is_carousel_item: options?.isCarouselItem ?? false
  }

  if (item.type === 'image') {
    body.image_url = item.url
  } else {
    body.video_url = item.url
    body.media_type = 'REELS'
  }

  if (item.alt) {
    body.alt_text = item.alt
  }

  const res = await providerFetch<{ id: string }>(`${GRAPH_API_BASE}/${accountId}/media`, {
    method: 'POST',
    body
  })

  return res.id
}

/**
 * Publish a prepared media container.
 */
async function publishContainer(
  accountId: string,
  accessToken: string,
  containerId: string
): Promise<{ id: string }> {
  return await providerFetch<{ id: string }>(`${GRAPH_API_BASE}/${accountId}/media_publish`, {
    method: 'POST',
    body: {
      creation_id: containerId,
      access_token: accessToken
    }
  })
}

/**
 * Build the Instagram post permalink.
 * Attempts to fetch the permalink from the API; falls back to a generic URL.
 */
async function getPostUrl(postId: string, accessToken: string): Promise<string> {
  try {
    const res = await providerFetch<{ permalink?: string }>(`${GRAPH_API_BASE}/${postId}`, {
      method: 'GET',
      params: {
        fields: 'permalink',
        access_token: accessToken
      }
    })
    return res.permalink || `https://www.instagram.com/p/${postId}/`
  } catch {
    return `https://www.instagram.com/p/${postId}/`
  }
}

// ── Provider implementation ────────────────────────────────────

/** Instagram social media provider using Container-based publishing (Graph API v20.0) */
export const instagramProvider: SocialPostProvider = {
  identifier: 'instagram',
  name: 'Instagram',

  async post(params: PostParams): Promise<PostResult> {
    const { accountId, accessToken, content, media, options } = params
    const instagramOptions = options as InstagramPostOptions | undefined
    const postType = instagramOptions?.type || 'post'

    try {
      // Instagram requires at least one piece of media
      if (!media?.length) {
        return failResult('Instagram requires at least one image or video.')
      }

      // ── Story ────────────────────────────────────────
      if (postType === 'story') {
        return await postStory(accountId, accessToken, media[0]!)
      }

      // ── Single video / Reel ──────────────────────────
      const videos = media.filter(m => m.type === 'video')
      if (videos.length > 0 && (postType === 'reel' || media.length === 1)) {
        return await postReel(accountId, accessToken, content, videos[0]!, options)
      }

      // ── Carousel (multiple media items) ──────────────
      if (media.length > 1) {
        return await postCarousel(accountId, accessToken, content, media, options)
      }

      // ── Single image post ────────────────────────────
      return await postSingleImage(accountId, accessToken, content, media[0]!, options)
    } catch (err: unknown) {
      console.error('[Instagram Provider] Post failed:', err)
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
        url: await getPostUrl(postId, accessToken),
        status: 'success'
      }
    } catch (err: unknown) {
      console.error('[Instagram Provider] Comment failed:', err)
      return parseGraphError(err)
    }
  }
}

// ── Post type implementations ──────────────────────────────────

async function postSingleImage(
  accountId: string,
  accessToken: string,
  caption: string,
  image: MediaItem,
  options?: InstagramPostOptions
): Promise<PostResult> {
  // Step 1: Create container
  const body: InstagramContainerBody = {
    image_url: image.url,
    caption,
    access_token: accessToken
  }

  if (image.alt) {
    body.alt_text = image.alt
  }

  if (options?.collaborators?.length) {
    body.collaborators = JSON.stringify(options.collaborators)
  }

  const container = await providerFetch<{ id: string }>(`${GRAPH_API_BASE}/${accountId}/media`, {
    method: 'POST',
    body
  })

  // Step 2: Publish
  const published = await publishContainer(accountId, accessToken, container.id)
  const url = await getPostUrl(published.id, accessToken)

  return {
    platformPostId: published.id,
    url,
    status: 'success'
  }
}

async function postReel(
  accountId: string,
  accessToken: string,
  caption: string,
  video: MediaItem,
  options?: InstagramPostOptions
): Promise<PostResult> {
  // Step 1: Create video container
  const body: InstagramContainerBody = {
    video_url: video.url,
    caption,
    media_type: 'REELS',
    access_token: accessToken
  }

  if (options?.collaborators?.length) {
    body.collaborators = JSON.stringify(options.collaborators)
  }

  const container = await providerFetch<{ id: string }>(`${GRAPH_API_BASE}/${accountId}/media`, {
    method: 'POST',
    body
  })

  // Step 2: Poll until ready
  const pollResult = await waitForContainerReady(container.id, accessToken)
  if (!pollResult.ready) {
    return failResult(pollResult.error || 'Video processing failed.')
  }

  // Step 3: Publish
  const published = await publishContainer(accountId, accessToken, container.id)
  const url = await getPostUrl(published.id, accessToken)

  return {
    platformPostId: published.id,
    url,
    status: 'success'
  }
}

async function postCarousel(
  accountId: string,
  accessToken: string,
  caption: string,
  media: MediaItem[],
  options?: InstagramPostOptions
): Promise<PostResult> {
  // Step 1: Create individual item containers (in parallel)
  const itemIds = await Promise.all(
    media.map(async (item) => {
      const containerId = await createItemContainer(accountId, accessToken, item, {
        isCarouselItem: true
      })

      // If video, wait for it to finish processing
      if (item.type === 'video') {
        const pollResult = await waitForContainerReady(containerId, accessToken)
        if (!pollResult.ready) {
          throw new Error(pollResult.error || `Video container ${containerId} processing failed.`)
        }
      }

      return containerId
    })
  )

  // Step 2: Create carousel container
  const body: InstagramContainerBody = {
    media_type: 'CAROUSEL',
    caption,
    children: itemIds.join(','),
    access_token: accessToken
  }

  if (options?.collaborators?.length) {
    body.collaborators = JSON.stringify(options.collaborators)
  }

  const carouselContainer = await providerFetch<{ id: string }>(`${GRAPH_API_BASE}/${accountId}/media`, {
    method: 'POST',
    body
  })

  // Step 3: Publish the carousel
  const published = await publishContainer(accountId, accessToken, carouselContainer.id)
  const url = await getPostUrl(published.id, accessToken)

  return {
    platformPostId: published.id,
    url,
    status: 'success'
  }
}

async function postStory(
  accountId: string,
  accessToken: string,
  media: MediaItem
): Promise<PostResult> {
  // Step 1: Create story container
  const body: InstagramContainerBody = {
    media_type: 'STORIES',
    access_token: accessToken
  }

  if (media.type === 'image') {
    body.image_url = media.url
  } else {
    body.video_url = media.url
  }

  const container = await providerFetch<{ id: string }>(`${GRAPH_API_BASE}/${accountId}/media`, {
    method: 'POST',
    body
  })

  // Step 2: If video, poll until ready
  if (media.type === 'video') {
    const pollResult = await waitForContainerReady(container.id, accessToken)
    if (!pollResult.ready) {
      return failResult(pollResult.error || 'Story video processing failed.')
    }
  }

  // Step 3: Publish
  const published = await publishContainer(accountId, accessToken, container.id)
  const url = await getPostUrl(published.id, accessToken)

  return {
    platformPostId: published.id,
    url,
    status: 'success'
  }
}

// --- Slice 2d follow-up: Instagram inbox reply ---
// Comment reply is UNGATED (instagram_manage_comments, in the base D2 scopes) — this closes a
// real gap where IG comments ingested but couldn't be replied to. DM send is App-Review-gated and
// routes through the linked Page's Messenger Send API (recipient = IGSID).

/** Pure: build an IG comment-reply request. commentId = the IG comment to reply under. */
export function buildIgCommentReply(commentId: string, content: string, accessToken: string) {
  return { url: `${GRAPH_API_BASE}/${commentId}/replies`, body: { message: content, access_token: accessToken } }
}

function readText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const text = value.trim()
  return text.length ? text : undefined
}

function firstLine(value: unknown): string | undefined {
  const text = readText(value)
  if (!text) return undefined
  return text.split(/\r?\n/).map(line => line.trim()).find(Boolean)?.slice(0, 160)
}

function instagramSourcePost(media: InstagramMediaNode): SourcePostMetadata | undefined {
  const mediaType = readText(media?.media_type)
  const imageUrl = mediaType === 'VIDEO'
    ? readText(media?.thumbnail_url) ?? readText(media?.media_url)
    : readText(media?.media_url) ?? readText(media?.thumbnail_url)
  const text = readText(media?.caption)
  const id = readText(media?.id)
  const title = firstLine(text)
  const thumbnailUrl = readText(media?.thumbnail_url)
  const permalink = readText(media?.permalink)
  if (!id && !title && !text && !imageUrl && !permalink) return undefined

  const sourcePost: SourcePostMetadata = { platform: 'instagram' }
  if (id) sourcePost.id = id
  if (title) sourcePost.title = title
  if (text) sourcePost.text = text
  if (imageUrl) sourcePost.imageUrl = imageUrl
  if (thumbnailUrl) sourcePost.thumbnailUrl = thumbnailUrl
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

function instagramCommentMetadata(raw: InstagramCommentNode, sourcePost: SourcePostMetadata | undefined, seed?: InboxItem['metadata']): InboxItem['metadata'] | undefined {
  const metadata: InboxItem['metadata'] = { ...(seed ?? {}) }
  const likeCount = readNumber(raw?.like_count)
  const replyCount = Array.isArray(raw?.replies?.data) ? raw.replies.data.length : readNumber(raw?.reply_count)
  const username = readText(raw?.username) ?? readText(raw?.from?.username)
  if (likeCount != null) metadata.likeCount = likeCount
  if (replyCount != null) metadata.replyCount = replyCount
  if (username) metadata.authorProfileUrl = `https://www.instagram.com/${username.replace(/^@/, '')}/`
  return withSourcePost(Object.keys(metadata).length ? metadata : undefined, sourcePost)
}

/** Pure: map an Instagram media list response with nested comments to InboxItems. */
export function mapInstagramMediaComments(api: unknown, opts: { accountId?: string } = {}): FetchInboxResult {
  const payload = api as InstagramMediaResponse | undefined
  const items: InboxItem[] = []
  for (const media of payload?.data ?? []) {
    const mediaId = readText(media?.id) ?? ''
    if (!mediaId) continue
    const sourcePost = instagramSourcePost(media)
    for (const c of media?.comments?.data ?? []) {
      const commentId = readText(c?.id) ?? ''
      if (!commentId) continue
      const username = readText(c?.username) ?? readText(c?.from?.username)
      const userId = readText(c?.from?.id)
      items.push({
        channelType: 'comment',
        platformConversationId: mediaId,
        permalink: readText(c?.permalink_url) ?? readText(media?.permalink),
        participant: { id: userId, name: username, handle: username },
        platformMessageId: commentId,
        authorId: userId,
        authorName: username,
        content: readText(c?.text) ?? '',
        messageType: 'comment',
        metadata: instagramCommentMetadata(c, sourcePost),
        platformTimestamp: readText(c?.timestamp)
      })

      for (const reply of c?.replies?.data ?? []) {
        const replyId = readText(reply?.id) ?? ''
        if (!replyId) continue
        const replyUsername = readText(reply?.username) ?? readText(reply?.from?.username)
        const replyUserId = readText(reply?.from?.id)
        const isBusinessReply = Boolean(opts.accountId && replyUserId === opts.accountId)
        items.push({
          channelType: 'comment',
          platformConversationId: mediaId,
          permalink: readText(reply?.permalink_url) ?? readText(c?.permalink_url) ?? readText(media?.permalink),
          participant: { id: replyUserId, name: replyUsername, handle: replyUsername },
          platformMessageId: replyId,
          parentPlatformMessageId: commentId,
          direction: isBusinessReply ? 'out' : 'in',
          authorId: replyUserId,
          authorName: replyUsername,
          content: readText(reply?.text) ?? '',
          messageType: 'comment_reply',
          metadata: instagramCommentMetadata(reply, sourcePost, { source: 'platform_sync' }),
          platformTimestamp: readText(reply?.timestamp)
        })
      }
    }
  }
  // The media cursor paginates media objects, not comments. Always rescan recent media; message
  // idempotency prevents duplicates while keeping the webhook fallback on current comments.
  return { items, nextCursor: null }
}

instagramProvider.fetchInbox = async ({ accountId, accessToken }: FetchInboxParams): Promise<FetchInboxResult> => {
  const url = new URL(`${GRAPH_API_BASE}/${accountId}/media`)
  url.searchParams.set('fields', 'id,permalink,caption,media_type,media_url,thumbnail_url,comments.limit(50){id,text,username,timestamp,like_count,from{id,username},replies.limit(50){id,text,username,timestamp,like_count,from{id,username}}}')
  url.searchParams.set('access_token', accessToken)
  url.searchParams.set('limit', '25')
  const res = await fetchWithTimeout(url, { timeoutMs: INBOX_FETCH_TIMEOUT_MS })
  if (!res.ok) throw new Error(`instagram comments fetchInbox ${res.status}`)
  return mapInstagramMediaComments(await res.json(), { accountId })
}

instagramProvider.reply = async ({ accountId, accessToken, conversationId, content, channelType, viaPageId }: ReplyParams): Promise<ReplyResult> => {
  if (channelType === 'dm') {
    // IG DMs send via the connected Page's Send API (recipient = IGSID = conversationId).
    const { url, body } = buildMessengerSend(viaPageId || accountId, conversationId, content, accessToken)
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const j: JsonObject = await res.json().catch(() => ({}))
    return res.ok && j.message_id
      ? { platformMessageId: String(j.message_id), status: 'success' }
      : { platformMessageId: '', status: 'failed', error: readText(readObject(j.error)?.message) ?? `http ${res.status}` }
  }
  // comment / mention → reply on the comment via the IG /replies edge.
  const { url, body } = buildIgCommentReply(conversationId, content, accessToken)
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const j: JsonObject = await res.json().catch(() => ({}))
  return res.ok && j.id
    ? { platformMessageId: String(j.id), status: 'success' }
    : { platformMessageId: '', status: 'failed', error: readText(readObject(j.error)?.message) ?? `http ${res.status}` }
}

// --- Slice 3 reporting: organic metrics collection ---
// ⚠️ Insight metric names follow Graph v20 docs; verify live before relying on prod numbers.
instagramProvider.fetchPostMetrics = async ({ accessToken, posts }: FetchPostMetricsParams): Promise<PostMetric[]> => {
  const out: PostMetric[] = []
  for (const p of posts) {
    try {
      const insRes = await fetch(`${GRAPH_API_BASE}/${p.platformPostId}/insights?metric=impressions,reach,likes,comments,saved,shares,video_views&access_token=${encodeURIComponent(accessToken)}`)
      const ins: JsonObject = await insRes.json().catch(() => ({}))
      out.push(mapIgMediaInsights(p.postId, p.platformPostId, ins))
    } catch { /* skip this post; others still collect */ }
  }
  return out
}

instagramProvider.fetchAccountMetrics = async ({ accountId, accessToken }: FetchAccountMetricsParams): Promise<AccountMetric> => {
  const tok = encodeURIComponent(accessToken)
  const insRes = await fetch(`${GRAPH_API_BASE}/${accountId}/insights?metric=impressions,reach,profile_views&period=day&access_token=${tok}`)
  const ins: JsonObject = await insRes.json().catch(() => ({}))
  const acctRes = await fetch(`${GRAPH_API_BASE}/${accountId}?fields=followers_count&access_token=${tok}`)
  const acct: JsonObject = await acctRes.json().catch(() => ({}))
  return mapIgAccountInsights(ins, readNumber(acct.followers_count))
}
