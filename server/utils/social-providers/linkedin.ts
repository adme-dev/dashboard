/**
 * LinkedIn Social Media Provider
 *
 * Implements LinkedIn Community Management REST APIs (version pinned by
 * LINKEDIN_API_VERSION) for organization Company Pages:
 *  - Posts API: text, image, multi-image and video posts
 *    https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api
 *  - Images / Videos API: initializeUpload → binary PUT (multipart for video) → finalize
 *  - Comments API (socialActions/{urn}/comments): first comments, inbox polling and replies
 *  - Organization share / follower statistics for reporting
 *
 * Posts default to organization authorship — the only account rows we create come from
 * organization discovery. Personal authorship requires `options.isOrganization === false`.
 */

import type {
  SocialPostProvider,
  PostParams,
  PostResult,
  CommentParams,
  MediaItem,
  FetchInboxParams,
  FetchInboxResult,
  ReplyParams,
  ReplyResult,
  FetchPostMetricsParams,
  PostMetric,
  FetchAccountMetricsParams,
  AccountMetric
} from './types'
import type { InboxItem } from '~~/server/utils/socialInbox/types'
import { providerFetch, providerFetchRaw } from './http'
import { LINKEDIN_API_VERSION } from '~~/server/utils/linkedinApiVersion'

const LINKEDIN_API_BASE = 'https://api.linkedin.com'
const LINKEDIN_VERSION = LINKEDIN_API_VERSION
const MAX_MULTI_IMAGES = 20

/** Inbox polling budget: most-recent posts scanned and comment pages read per post. */
export const LINKEDIN_INBOX_MAX_POSTS = 10
export const LINKEDIN_INBOX_COMMENT_PAGE_SIZE = 50
/** Max LinkedIn API calls per inbox sync; unfinished traversal resumes from the cursor next run. */
export const LINKEDIN_INBOX_CALL_BUDGET = 30
const LINKEDIN_SOCIAL_METADATA_BATCH_SIZE = 20
/** Share statistics accepts multiple URNs per call; keep URLs comfortably short. */
const LINKEDIN_STATS_BATCH_SIZE = 20

/**
 * Build common LinkedIn REST headers.
 */
function linkedinHeaders(accessToken: string, extra: Record<string, string> = {}): Record<string, string> {
  return {
    'Authorization': `Bearer ${accessToken}`,
    'LinkedIn-Version': LINKEDIN_VERSION,
    'X-Restli-Protocol-Version': '2.0.0',
    'Content-Type': 'application/json',
    ...extra
  }
}

/**
 * URL-encode a URN for use in a Rest.li 2.0 path or query value. Parentheses are
 * Rest.li structural characters, so composite comment URNs must encode them too.
 */
export function encodeLinkedInUrn(urn: string): string {
  return encodeURIComponent(urn).replace(/\(/g, '%28').replace(/\)/g, '%29')
}

/** Organization numeric id → URN; an already-qualified URN passes through unchanged. */
export function linkedinOrganizationUrn(accountId: string): string {
  return accountId.startsWith('urn:li:') ? accountId : `urn:li:organization:${accountId}`
}

/**
 * Build the author/actor URN. Organization is the default: every LinkedIn account row is
 * created by organization discovery. Only an explicit `isOrganization: false` posts as a member.
 */
export function linkedinAuthorUrn(accountId: string, options?: Record<string, unknown>): string {
  if (accountId.startsWith('urn:li:')) return accountId
  return options?.isOrganization === false ? `urn:li:person:${accountId}` : `urn:li:organization:${accountId}`
}

function headerValue(headers: Headers | undefined, name: string): string {
  return headers?.get?.(name)?.trim() ?? ''
}

/**
 * Upload a single image to LinkedIn.
 *
 * Flow (Images API):
 * 1. Initialize upload → get uploadUrl and image URN
 * 2. Download binary from our R2 URL
 * 3. PUT binary to LinkedIn's uploadUrl
 * 4. Return the image URN for use in post creation
 */
async function uploadImage(
  accessToken: string,
  ownerUrn: string,
  imageUrl: string
): Promise<{ imageUrn: string } | { error: string }> {
  try {
    const initResponse = await providerFetch<{
      value: {
        uploadUrl: string
        image: string
      }
    }>(`${LINKEDIN_API_BASE}/rest/images?action=initializeUpload`, {
      method: 'POST',
      headers: linkedinHeaders(accessToken),
      body: {
        initializeUploadRequest: {
          owner: ownerUrn
        }
      }
    })

    const uploadUrl = initResponse.value?.uploadUrl
    const imageUrn = initResponse.value?.image

    if (!uploadUrl || !imageUrn) {
      return {
        error: 'LinkedIn image upload initialization failed: missing uploadUrl or image URN'
      }
    }

    const imageBuffer = await providerFetch<ArrayBuffer>(imageUrl, {
      responseType: 'arrayBuffer'
    })

    await providerFetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/octet-stream'
      },
      body: imageBuffer
    })

    return { imageUrn }
  } catch (error: unknown) {
    const err = error as { message?: string }
    const message = err.message || 'Unknown error during LinkedIn image upload'
    console.error('[LinkedIn] Image upload failed:', message)
    return { error: message }
  }
}

interface LinkedInVideoUploadInstruction {
  uploadUrl: string
  firstByte: number
  lastByte: number
}

/**
 * Upload a single video to LinkedIn.
 *
 * Flow (Videos API multipart upload):
 * 1. Download binary from our R2 URL (to learn the real byte size)
 * 2. Initialize upload with fileSizeBytes → uploadInstructions (byte ranges), uploadToken, video URN
 * 3. PUT each byte range to its uploadUrl, collecting the ETag response header per part
 * 4. Finalize with uploadToken + uploadedPartIds (ETags in instruction order)
 */
async function uploadVideo(
  accessToken: string,
  ownerUrn: string,
  videoUrl: string
): Promise<{ videoUrn: string } | { error: string }> {
  try {
    const videoBuffer = await providerFetch<ArrayBuffer>(videoUrl, {
      responseType: 'arrayBuffer'
    })
    const fileSizeBytes = videoBuffer?.byteLength ?? 0
    if (!fileSizeBytes) {
      return { error: 'LinkedIn video upload failed: source video is empty' }
    }

    const initResponse = await providerFetch<{
      value: {
        uploadInstructions: LinkedInVideoUploadInstruction[]
        uploadToken?: string
        video: string
      }
    }>(`${LINKEDIN_API_BASE}/rest/videos?action=initializeUpload`, {
      method: 'POST',
      headers: linkedinHeaders(accessToken),
      body: {
        initializeUploadRequest: {
          owner: ownerUrn,
          fileSizeBytes,
          uploadCaptions: false,
          uploadThumbnail: false
        }
      }
    })

    const uploadInstructions = initResponse.value?.uploadInstructions
    const videoUrn = initResponse.value?.video

    if (!uploadInstructions?.length || !videoUrn) {
      return {
        error:
          'LinkedIn video upload initialization failed: missing upload instructions or video URN'
      }
    }

    const uploadedPartIds: string[] = []
    for (const instruction of uploadInstructions) {
      const part = videoBuffer.slice(instruction.firstByte, instruction.lastByte + 1)
      const response = await providerFetchRaw(instruction.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: part
      })
      const etag = headerValue(response.headers, 'etag')
      if (!etag) {
        return { error: `LinkedIn video upload failed: no ETag returned for bytes ${instruction.firstByte}-${instruction.lastByte}` }
      }
      uploadedPartIds.push(etag)
    }

    await providerFetch(`${LINKEDIN_API_BASE}/rest/videos?action=finalizeUpload`, {
      method: 'POST',
      headers: linkedinHeaders(accessToken),
      body: {
        finalizeUploadRequest: {
          video: videoUrn,
          uploadToken: initResponse.value?.uploadToken ?? '',
          uploadedPartIds
        }
      }
    })

    return { videoUrn }
  } catch (error: unknown) {
    const err = error as { message?: string }
    const message = err.message || 'Unknown error during LinkedIn video upload'
    console.error('[LinkedIn] Video upload failed:', message)
    return { error: message }
  }
}

/**
 * Create a LinkedIn post. The Posts API answers 201 with the post URN in the
 * `x-restli-id` response header (body is usually empty).
 */
async function createPost(
  params: PostParams,
  author: string,
  visibility: string,
  content: Record<string, unknown> | null,
  context: string
): Promise<PostResult> {
  try {
    const response = await providerFetchRaw<{ id?: string }>(`${LINKEDIN_API_BASE}/rest/posts`, {
      method: 'POST',
      headers: linkedinHeaders(params.accessToken),
      body: {
        author,
        commentary: params.content.slice(0, 3000),
        visibility,
        distribution: {
          feedDistribution: 'MAIN_FEED',
          targetEntities: [],
          thirdPartyDistributionChannels: []
        },
        ...(content ? { content } : {}),
        lifecycleState: 'PUBLISHED',
        isReshareDisabledByAuthor: false
      }
    })

    const postId = headerValue(response.headers, 'x-restli-id') || response._data?.id || ''
    if (!postId) {
      return {
        platformPostId: '',
        url: '',
        status: 'failed',
        error: `LinkedIn accepted the ${context} but returned no post id`
      }
    }

    return {
      platformPostId: postId,
      url: `https://www.linkedin.com/feed/update/${postId}/`,
      status: 'success'
    }
  } catch (error: unknown) {
    return handleLinkedInError(error, context)
  }
}

/**
 * Standardised error handler for LinkedIn API errors.
 */
function handleLinkedInError(error: unknown, context: string): PostResult {
  const err = error as { statusCode?: number, data?: { message?: string }, message?: string }
  let message: string

  if (err.statusCode === 401) {
    message = 'LinkedIn access token expired or invalid. Please re-authenticate.'
  } else if (err.statusCode === 403) {
    message
      = 'Insufficient LinkedIn permissions. Check the w_organization_social scope and that the connecting member is a Page admin.'
  } else if (err.statusCode === 429) {
    message = 'LinkedIn rate limit exceeded. Please try again later.'
  } else {
    message = err.data?.message || err.message || `Unknown LinkedIn API error during ${context}`
  }

  console.error(`[LinkedIn] ${context} failed (${err.statusCode || 'unknown'}):`, message)

  return {
    platformPostId: '',
    url: '',
    status: 'failed',
    error: message
  }
}

/** Thread URN inside a composite comment URN: urn:li:comment:(<thread>,<id>) → <thread>. */
export function linkedinCommentThreadUrn(commentUrn: string): string | null {
  const match = commentUrn.match(/^urn:li:comment:\((.+),[^,()]+\)$/)
  return match?.[1] ?? null
}

/**
 * Create a comment as `actor` on a post (top-level) or under a comment (nested reply).
 * Returns the created comment URN (falls back to the `x-restli-id` comment id).
 */
async function createLinkedInComment(
  accessToken: string,
  actor: string,
  targetUrn: string,
  text: string
): Promise<string> {
  const threadUrn = linkedinCommentThreadUrn(targetUrn)
  const body: Record<string, unknown> = {
    actor,
    object: threadUrn ?? targetUrn,
    message: { text: text.slice(0, 1250) }
  }
  if (threadUrn) body.parentComment = targetUrn

  const response = await providerFetchRaw<{ id?: string, commentUrn?: string }>(
    `${LINKEDIN_API_BASE}/rest/socialActions/${encodeLinkedInUrn(targetUrn)}/comments`,
    {
      method: 'POST',
      headers: linkedinHeaders(accessToken),
      body
    }
  )
  return response._data?.commentUrn
    || headerValue(response.headers, 'x-restli-id')
    || String(response._data?.id ?? '')
}

/**
 * LinkedIn social media provider (organization Company Pages).
 *
 * @example
 * ```ts
 * const result = await linkedinProvider.post({
 *   accountId: '98765',
 *   accessToken: 'tok_xyz',
 *   content: 'Check out our latest arrivals!',
 *   media: [{ url: 'https://r2.example.com/car.jpg', type: 'image', alt: '2025 GWM Tank' }],
 *   options: { isOrganization: true },
 * })
 * ```
 */
export const linkedinProvider: SocialPostProvider = {
  identifier: 'linkedin',
  name: 'LinkedIn',

  async post(params: PostParams): Promise<PostResult> {
    const visibility = params.options?.visibility === 'CONNECTIONS' ? 'CONNECTIONS' : 'PUBLIC'
    const author = linkedinAuthorUrn(params.accountId, params.options)

    const media = params.media || []
    const images = media.filter((m: MediaItem) => m.type === 'image').slice(0, MAX_MULTI_IMAGES)
    const videos = media.filter((m: MediaItem) => m.type === 'video')

    // --- Video post ---
    if (videos.length > 0) {
      const uploadResult = await uploadVideo(params.accessToken, author, videos[0]!.url)
      if ('error' in uploadResult) {
        return { platformPostId: '', url: '', status: 'failed', error: uploadResult.error }
      }
      return createPost(params, author, visibility, {
        media: { title: 'Video', id: uploadResult.videoUrn }
      }, 'video post')
    }

    // --- Image post (single or multi) ---
    if (images.length > 0) {
      const uploadResults = await Promise.all(
        images.map(img => uploadImage(params.accessToken, author, img.url))
      )

      const successfulUrns = uploadResults.flatMap((result, index) =>
        'imageUrn' in result ? [{ urn: result.imageUrn, alt: images[index]?.alt }] : []
      )
      if (!successfulUrns.length) {
        const firstError = (uploadResults[0] as { error: string }).error
        return {
          platformPostId: '',
          url: '',
          status: 'failed',
          error: `All image uploads failed: ${firstError}`
        }
      }

      if (successfulUrns.length === 1) {
        const image = successfulUrns[0]!
        return createPost(params, author, visibility, {
          media: { id: image.urn, ...(image.alt ? { altText: image.alt } : {}) }
        }, 'image post')
      }

      return createPost(params, author, visibility, {
        multiImage: {
          images: successfulUrns.map(img => ({ id: img.urn, ...(img.alt ? { altText: img.alt } : {}) }))
        }
      }, 'multi-image post')
    }

    // --- Text-only post ---
    if (params.content.trim()) {
      return createPost(params, author, visibility, null, 'text post')
    }

    return {
      platformPostId: '',
      url: '',
      status: 'failed',
      error: 'LinkedIn post requires either text content or media.'
    }
  },

  async comment(params: CommentParams): Promise<PostResult> {
    try {
      const commentId = await createLinkedInComment(
        params.accessToken,
        linkedinAuthorUrn(params.accountId, params.options),
        params.postId,
        params.content
      )
      return {
        platformPostId: commentId,
        url: '',
        status: 'success'
      }
    } catch (error: unknown) {
      return handleLinkedInError(error, 'comment')
    }
  }
}

// --- Inbox: organization post comments ---

interface LinkedInComment {
  id?: string | number
  commentUrn?: string
  actor?: string
  object?: string
  parentComment?: string
  message?: { text?: string }
  created?: { time?: number }
  /** Present on some comment responses; used to detect nested replies without an extra call. */
  commentsSummary?: { aggregatedTotalComments?: number, totalFirstLevelComments?: number }
}

interface LinkedInPaged<T> {
  elements?: T[]
  paging?: { start?: number, count?: number, links?: Array<{ rel?: string }> }
}

interface LinkedInSocialMetadata {
  entity?: string
  commentSummary?: { count?: number, topLevelCount?: number }
}

function hasNextPage(page: LinkedInPaged<unknown>): boolean {
  return Boolean(page.paging?.links?.some(link => link.rel === 'next'))
}

function commentUrnFor(comment: LinkedInComment): string {
  if (comment.commentUrn) return comment.commentUrn
  if (String(comment.id ?? '').startsWith('urn:li:comment:')) return String(comment.id)
  if (comment.object && comment.id != null) return `urn:li:comment:(${comment.object},${comment.id})`
  return String(comment.id ?? '')
}

/**
 * Pure: map a LinkedIn socialActions comments response to InboxItems. Conversations are
 * anchored on the post (`postUrn`, falling back to the comment's thread object); the message id
 * is the composite comment URN. Nested replies carry their top-level comment as parent.
 */
export function mapLinkedInComments(
  api: LinkedInPaged<LinkedInComment> | null | undefined,
  postUrn?: string,
  parentCommentUrn?: string
): FetchInboxResult {
  const items: InboxItem[] = (api?.elements ?? []).map(c => ({
    channelType: 'comment' as const,
    platformConversationId: String(postUrn ?? c.object ?? ''),
    permalink: postUrn ? `https://www.linkedin.com/feed/update/${postUrn}/` : undefined,
    participant: { id: c.actor },
    platformMessageId: commentUrnFor(c),
    parentPlatformMessageId: c.parentComment ?? parentCommentUrn,
    authorId: c.actor,
    content: c.message?.text ?? '',
    messageType: 'comment',
    platformTimestamp: c.created?.time ? new Date(c.created.time).toISOString() : undefined
  }))
  return { items, nextCursor: null }
}

/**
 * Per-post traversal progress persisted in the inbox cursor (JSON string).
 * - `count`: post commentSummary.count (incl. replies) when the last full traversal finished;
 *   an unchanged count lets us skip the post entirely.
 * - `hw`: newest top-level comment time from the last *completed* traversal.
 * - `start` / `pendingHw`: an in-progress traversal resumed next run when the call budget ran out.
 * - `replies`: reply count already ingested per top-level comment URN.
 */
interface LinkedInPostInboxState {
  count?: number
  hw?: number
  start?: number
  pendingHw?: number
  replies?: Record<string, number>
}

interface LinkedInInboxCursor {
  v: 2
  posts: Record<string, LinkedInPostInboxState>
}

export function parseLinkedInInboxCursor(cursor: string | null | undefined): LinkedInInboxCursor {
  if (cursor) {
    try {
      const parsed = JSON.parse(cursor) as Partial<LinkedInInboxCursor>
      if (parsed?.v === 2 && parsed.posts && typeof parsed.posts === 'object') return { v: 2, posts: parsed.posts }
    } catch {
      // Legacy timestamp cursor → start fresh; ingestion is idempotent by comment URN.
    }
  }
  return { v: 2, posts: {} }
}

function createCallBudget(limit: number) {
  let left = limit
  return {
    take: () => (left > 0 ? (left--, true) : false),
    get left() { return left }
  }
}

type CallBudget = ReturnType<typeof createCallBudget>

/** Batch socialMetadata for posts or comments → commentSummary.count by URN. Null when out of budget. */
async function fetchCommentCounts(
  accessToken: string,
  urns: string[],
  budget: CallBudget
): Promise<Map<string, number> | null> {
  const counts = new Map<string, number>()
  for (let i = 0; i < urns.length; i += LINKEDIN_SOCIAL_METADATA_BATCH_SIZE) {
    if (!budget.take()) return null
    const batch = urns.slice(i, i + LINKEDIN_SOCIAL_METADATA_BATCH_SIZE)
    const data = await providerFetch<{ results?: Record<string, LinkedInSocialMetadata> }>(
      `${LINKEDIN_API_BASE}/rest/socialMetadata?ids=List(${batch.map(encodeLinkedInUrn).join(',')})`,
      { headers: linkedinHeaders(accessToken) }
    )
    for (const [key, meta] of Object.entries(data.results ?? {})) {
      const count = meta?.commentSummary?.count
      if (typeof count === 'number') counts.set(key, count)
    }
  }
  return counts
}

function summaryReplyCount(comment: LinkedInComment): number | undefined {
  const summary = comment.commentsSummary
  return summary?.aggregatedTotalComments ?? summary?.totalFirstLevelComments
}

/** Page through nested replies under a top-level comment. Returns null if the budget ran out. */
async function fetchNestedReplies(
  accessToken: string,
  commentUrn: string,
  budget: CallBudget
): Promise<LinkedInComment[] | null> {
  const replies: LinkedInComment[] = []
  let start = 0
  for (;;) {
    if (!budget.take()) return null
    const page = await providerFetch<LinkedInPaged<LinkedInComment>>(
      `${LINKEDIN_API_BASE}/rest/socialActions/${encodeLinkedInUrn(commentUrn)}/comments?start=${start}&count=${LINKEDIN_INBOX_COMMENT_PAGE_SIZE}`,
      { headers: linkedinHeaders(accessToken) }
    )
    const elements = page.elements ?? []
    replies.push(...elements)
    if (!hasNextPage(page) || !elements.length) return replies
    start += elements.length
  }
}

linkedinProvider.fetchInbox = async ({ accountId, accessToken, cursor }: FetchInboxParams): Promise<FetchInboxResult> => {
  const orgUrn = linkedinOrganizationUrn(accountId)
  const previous = parseLinkedInInboxCursor(cursor)
  const budget = createCallBudget(LINKEDIN_INBOX_CALL_BUDGET)
  const items: InboxItem[] = []

  budget.take()
  const posts = await providerFetch<LinkedInPaged<{ id?: string }>>(
    `${LINKEDIN_API_BASE}/rest/posts?author=${encodeLinkedInUrn(orgUrn)}&q=author&count=${LINKEDIN_INBOX_MAX_POSTS}&sortBy=LAST_MODIFIED`,
    { headers: linkedinHeaders(accessToken, { 'X-RestLi-Method': 'FINDER' }) }
  )
  const postUrns = (posts.elements ?? []).map(post => post.id).filter((id): id is string => Boolean(id))

  // Only posts still in the recent window are tracked, which keeps the cursor bounded.
  const next: LinkedInInboxCursor = { v: 2, posts: {} }
  for (const urn of postUrns) {
    if (previous.posts[urn]) next.posts[urn] = previous.posts[urn]!
  }

  // Change detection: skip posts whose total comment count (incl. replies) is unchanged.
  let postCounts: Map<string, number> | null = null
  let metadataAvailable = true
  try {
    postCounts = await fetchCommentCounts(accessToken, postUrns, budget)
  } catch (error: unknown) {
    metadataAvailable = false
    console.warn('[LinkedIn] socialMetadata unavailable; traversing all recent posts:', (error as { message?: string }).message)
  }

  let exhausted = false
  for (const postUrn of postUrns) {
    if (exhausted) break
    const state: LinkedInPostInboxState = { ...(next.posts[postUrn] ?? {}) }
    const total = postCounts?.get(postUrn)
    if (state.start == null) {
      if (total !== undefined && state.count === total) continue
      state.start = 0
      state.pendingHw = state.hw ?? 0
    }

    while (!exhausted) {
      if (!budget.take()) {
        exhausted = true
        break
      }
      const page: LinkedInPaged<LinkedInComment> = await providerFetch<LinkedInPaged<LinkedInComment>>(
        `${LINKEDIN_API_BASE}/rest/socialActions/${encodeLinkedInUrn(postUrn)}/comments?start=${state.start}&count=${LINKEDIN_INBOX_COMMENT_PAGE_SIZE}`,
        { headers: linkedinHeaders(accessToken) }
      )
      const elements: LinkedInComment[] = page.elements ?? []

      // Top-level comments newer than the last completed traversal. The Page's own comments
      // are skipped — they are recorded as outbound when we send them.
      const fresh = elements.filter(c => c.actor !== orgUrn && (c.created?.time ?? 0) > (state.hw ?? 0))
      for (const c of fresh) state.pendingHw = Math.max(state.pendingHw ?? 0, c.created?.time ?? 0)
      items.push(...mapLinkedInComments({ elements: fresh }, postUrn).items)

      // Nested replies (customers can reply under the Page's comments too, so check every thread).
      const replyCounts = new Map<string, number>()
      const unknown: string[] = []
      for (const c of elements) {
        const urn = commentUrnFor(c)
        const known = summaryReplyCount(c)
        if (known === undefined) unknown.push(urn)
        else replyCounts.set(urn, known)
      }
      if (unknown.length && metadataAvailable) {
        let looked: Map<string, number> | null = null
        try {
          looked = await fetchCommentCounts(accessToken, unknown, budget)
        } catch (error: unknown) {
          // Without reply counts we cannot find nested replies; keep ingesting top-level comments.
          metadataAvailable = false
          console.warn('[LinkedIn] comment socialMetadata unavailable; nested replies skipped:', (error as { message?: string }).message)
        }
        if (metadataAvailable && !looked) {
          exhausted = true
          break
        }
        for (const [urn, count] of looked ?? []) replyCounts.set(urn, count)
      }

      for (const c of elements) {
        const urn = commentUrnFor(c)
        const count = replyCounts.get(urn) ?? 0
        if (count <= (state.replies?.[urn] ?? 0)) continue
        const replies = await fetchNestedReplies(accessToken, urn, budget)
        if (!replies) {
          exhausted = true
          break
        }
        const inbound = replies.filter(reply => reply.actor !== orgUrn)
        items.push(...mapLinkedInComments({ elements: inbound }, postUrn, urn).items)
        state.replies = { ...(state.replies ?? {}), [urn]: count }
      }
      // Out of budget mid-page: keep `start` so this page (and its unfinished threads) is retried.
      if (exhausted) break

      if (hasNextPage(page) && elements.length) {
        state.start = (state.start ?? 0) + elements.length
        continue
      }

      // Fully paged: only now does the high-water mark (and change-detection count) advance.
      state.hw = state.pendingHw ?? state.hw
      if (total !== undefined) state.count = total
      else delete state.count
      delete state.start
      delete state.pendingHw
      break
    }

    next.posts[postUrn] = state
  }

  return { items, nextCursor: JSON.stringify(next) }
}

linkedinProvider.reply = async ({ accountId, accessToken, conversationId, threadParentId, content }: ReplyParams): Promise<ReplyResult> => {
  // conversationId = resolved reply target: the latest inbound comment URN, or the post URN when the
  // conversation has no inbound comment id. LinkedIn nests one level deep, so when that comment is
  // itself a nested reply, reply under its top-level parent (`threadParentId`).
  const target = threadParentId && linkedinCommentThreadUrn(threadParentId) ? threadParentId : conversationId
  try {
    const commentId = await createLinkedInComment(accessToken, linkedinOrganizationUrn(accountId), target, content)
    return { platformMessageId: commentId, status: 'success' }
  } catch (error: unknown) {
    const result = handleLinkedInError(error, 'reply')
    return { platformMessageId: '', status: 'failed', error: result.error }
  }
}

// --- Reporting: organization share + follower statistics ---

interface LinkedInShareStatistics {
  share?: string
  ugcPost?: string
  totalShareStatistics?: {
    impressionCount?: number
    uniqueImpressionsCount?: number
    clickCount?: number
    likeCount?: number
    commentCount?: number
    shareCount?: number
  }
}

function shareStatisticsUrl(orgUrn: string, shares: string[], ugcPosts: string[]): string {
  const params = [`q=organizationalEntity`, `organizationalEntity=${encodeLinkedInUrn(orgUrn)}`]
  if (shares.length) params.push(`shares=List(${shares.map(encodeLinkedInUrn).join(',')})`)
  if (ugcPosts.length) params.push(`ugcPosts=List(${ugcPosts.map(encodeLinkedInUrn).join(',')})`)
  return `${LINKEDIN_API_BASE}/rest/organizationalEntityShareStatistics?${params.join('&')}`
}

function toPostMetric(postId: string, platformPostId: string, stats: LinkedInShareStatistics['totalShareStatistics'] = {}): PostMetric {
  const clicks = stats.clickCount ?? 0
  const likes = stats.likeCount ?? 0
  const commentsCount = stats.commentCount ?? 0
  const shares = stats.shareCount ?? 0
  return {
    postId,
    platformPostId,
    impressions: stats.impressionCount ?? 0,
    reach: stats.uniqueImpressionsCount ?? 0,
    clicks,
    likes,
    reactions: likes,
    commentsCount,
    shares,
    engagements: clicks + likes + commentsCount + shares
  }
}

linkedinProvider.fetchPostMetrics = async ({ accountId, accessToken, posts }: FetchPostMetricsParams): Promise<PostMetric[]> => {
  const orgUrn = linkedinOrganizationUrn(accountId)
  const supported = posts.filter(p => /^urn:li:(share|ugcPost):/.test(p.platformPostId))
  const metrics: PostMetric[] = []

  for (let i = 0; i < supported.length; i += LINKEDIN_STATS_BATCH_SIZE) {
    const batch = supported.slice(i, i + LINKEDIN_STATS_BATCH_SIZE)
    const shares = batch.filter(p => p.platformPostId.startsWith('urn:li:share:')).map(p => p.platformPostId)
    const ugcPosts = batch.filter(p => p.platformPostId.startsWith('urn:li:ugcPost:')).map(p => p.platformPostId)
    const data = await providerFetch<LinkedInPaged<LinkedInShareStatistics>>(
      shareStatisticsUrl(orgUrn, shares, ugcPosts),
      { headers: linkedinHeaders(accessToken) }
    )
    const byUrn = new Map((data.elements ?? []).map(el => [el.share ?? el.ugcPost ?? '', el.totalShareStatistics]))
    // Posts with no impressions/actions are omitted by LinkedIn — they are zero, not missing.
    for (const post of batch) metrics.push(toPostMetric(post.postId, post.platformPostId, byUrn.get(post.platformPostId)))
  }

  return metrics
}

linkedinProvider.fetchAccountMetrics = async ({ accountId, accessToken }: FetchAccountMetricsParams): Promise<AccountMetric> => {
  const orgUrn = linkedinOrganizationUrn(accountId)
  const network = await providerFetch<{ firstDegreeSize?: number }>(
    `${LINKEDIN_API_BASE}/rest/networkSizes/${encodeLinkedInUrn(orgUrn)}?edgeType=COMPANY_FOLLOWED_BY_MEMBER`,
    { headers: linkedinHeaders(accessToken) }
  )
  const metric: AccountMetric = {}
  if (typeof network.firstDegreeSize === 'number') metric.followers = network.firstDegreeSize

  // Lifetime (rolling 12-month) organic share totals. On failure, impressions/reach stay
  // undefined (persisted as NULL, never 0) and the failure is reported as partial.
  try {
    const stats = await providerFetch<LinkedInPaged<LinkedInShareStatistics>>(
      shareStatisticsUrl(orgUrn, [], []),
      { headers: linkedinHeaders(accessToken) }
    )
    const totals = stats.elements?.[0]?.totalShareStatistics
    if (typeof totals?.impressionCount === 'number') metric.impressions = totals.impressionCount
    if (typeof totals?.uniqueImpressionsCount === 'number') metric.reach = totals.uniqueImpressionsCount
  } catch (error: unknown) {
    const message = (error as { message?: string }).message || 'unknown error'
    console.warn('[LinkedIn] organization share statistics unavailable:', message)
    metric.partialFailures = [`share statistics unavailable: ${message}`.slice(0, 300)]
  }

  return metric
}
