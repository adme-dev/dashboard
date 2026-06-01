/**
 * YouTube Provider
 *
 * Uploads videos (including Shorts) to YouTube using the YouTube Data API v3
 * resumable upload protocol. Uses $fetch for all HTTP calls (Cloudflare Workers compatible).
 *
 * Reference: https://developers.google.com/youtube/v3/docs/videos/insert
 * Resumable uploads: https://developers.google.com/youtube/v3/guides/using_resumable_upload_protocol
 *
 * Quota info:
 *   - Daily quota: 10,000 units
 *   - Video upload: 1,600 units (~6 uploads/day)
 *   - Update metadata: 50 units
 */

import type { SocialPostProvider, PostParams, PostResult, CommentParams, FetchInboxParams, FetchInboxResult, ReplyParams, ReplyResult } from './types'
import type { InboxItem } from '~~/server/utils/socialInbox/types'

const YOUTUBE_API_BASE = 'https://www.googleapis.com'
const YOUTUBE_UPLOAD_BASE = `${YOUTUBE_API_BASE}/upload/youtube/v3`
const YOUTUBE_API_V3 = `${YOUTUBE_API_BASE}/youtube/v3`

// ── YouTube-specific option types ──────────────────────────────

interface YouTubeOptions {
  /** Video title (required — used as video title on YouTube) */
  title?: string
  /** Video tags for discoverability */
  tags?: string[]
  /** Privacy status of the uploaded video */
  privacyStatus?: 'public' | 'private' | 'unlisted'
  /** Mark as YouTube Shorts — auto-adds #Shorts to title */
  isShort?: boolean
  /** COPPA: whether the video is made for kids */
  madeForKids?: boolean
  /** YouTube video category ID (default: '2' = Autos & Vehicles) */
  categoryId?: string
  /** Optional playlist ID to add the video to after upload */
  playlistId?: string
}

interface YouTubeUploadMetadata {
  snippet: {
    title: string
    description: string
    tags: string[]
    categoryId: string
  }
  status: {
    privacyStatus: 'public' | 'private' | 'unlisted'
    selfDeclaredMadeForKids: boolean
  }
}

// ── Error helpers ──────────────────────────────────────────────

interface YouTubeAPIError {
  error?: {
    code?: number
    message?: string
    errors?: Array<{
      message?: string
      domain?: string
      reason?: string
    }>
  }
}

/**
 * Parse a YouTube Data API error into a user-friendly PostResult.
 * Handles token expiration, quota exceeded, and permission errors.
 */
function parseYouTubeError(err: unknown): PostResult {
  const raw = err as {
    data?: YouTubeAPIError
    statusCode?: number
    status?: number
    message?: string
  }
  const apiErr = raw?.data?.error
  const statusCode = raw?.statusCode || raw?.status
  const firstError = apiErr?.errors?.[0]

  // Token expired or invalid
  if (statusCode === 401 || firstError?.reason === 'authError') {
    return failResult('Token expired or invalid. Please reconnect your YouTube/Google account.')
  }

  // Quota exceeded
  if (
    statusCode === 403 &&
    (firstError?.reason === 'quotaExceeded' || firstError?.reason === 'dailyLimitExceeded')
  ) {
    return failResult(
      'YouTube API quota exceeded (10,000 units/day). Video uploads cost 1,600 units each. Try again tomorrow.'
    )
  }

  // Forbidden — insufficient permissions
  if (statusCode === 403) {
    return failResult(
      `Insufficient YouTube permissions: ${firstError?.message || apiErr?.message || 'Ensure the account has upload access.'}`
    )
  }

  // Video too long for Shorts
  if (firstError?.reason === 'videoTooLong') {
    return failResult('Video is too long. YouTube Shorts must be 60 seconds or less.')
  }

  // Upload too large
  if (statusCode === 413) {
    return failResult('Video file is too large. YouTube allows up to 256 GB per video.')
  }

  // Generic fallback
  const msg = firstError?.message || apiErr?.message || raw?.message || 'Unknown YouTube API error'
  return failResult(msg)
}

function failResult(error: string): PostResult {
  return { platformPostId: '', url: '', status: 'failed', error }
}

// ── Internal helpers ───────────────────────────────────────────

/**
 * Build the video title, appending #Shorts if flagged.
 */
function buildVideoTitle(content: string, options: YouTubeOptions): string {
  const title = options.title || content.slice(0, 100) || 'Untitled Video'

  if (options.isShort && !title.includes('#Shorts')) {
    return `${title} #Shorts`
  }

  return title
}

/**
 * Map a MIME type string to a Content-Type suitable for the upload PUT request.
 * Falls back to 'video/*' if unknown.
 */
function resolveVideoContentType(mimeType?: string): string {
  if (mimeType && mimeType.startsWith('video/')) {
    return mimeType
  }
  return 'video/*'
}

/**
 * Step 1 — Initiate a resumable upload session.
 * Returns the upload URI from the `Location` response header.
 *
 * @see https://developers.google.com/youtube/v3/guides/using_resumable_upload_protocol#start-upload
 */
async function initiateResumableUpload(
  accessToken: string,
  metadata: YouTubeUploadMetadata,
  videoContentType: string,
  videoSizeBytes: number
): Promise<string> {
  // $fetch follows redirects and consumes the body automatically,
  // but we need the raw `Location` header. Use the `onResponse` hook.
  let uploadUri = ''

  await $fetch
    .raw(`${YOUTUBE_UPLOAD_BASE}/videos?uploadType=resumable&part=snippet,status`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Length': String(videoSizeBytes),
        'X-Upload-Content-Type': videoContentType,
      },
      body: metadata,
      // Prevent $fetch from throwing on the 200 response so we can read headers
      ignoreResponseError: false,
    })
    .then(response => {
      uploadUri = response.headers.get('location') || ''
    })

  if (!uploadUri) {
    throw new Error('YouTube resumable upload: did not receive upload URI in Location header')
  }

  return uploadUri
}

/**
 * Step 2 — Fetch the video binary from an R2 public URL as an ArrayBuffer.
 */
async function fetchVideoBuffer(videoUrl: string): Promise<ArrayBuffer> {
  const response = await $fetch.raw(videoUrl, {
    responseType: 'arrayBuffer',
  })

  if (!response._data) {
    throw new Error(`Failed to download video from ${videoUrl}`)
  }

  return response._data as ArrayBuffer
}

/**
 * Step 3 — Upload the video binary to Google's resumable upload URI.
 * Returns the completed video resource with its ID.
 */
async function uploadVideoToUri(
  uploadUri: string,
  videoBuffer: ArrayBuffer,
  videoContentType: string
): Promise<{ id: string }> {
  const res = await $fetch<{ id: string }>(uploadUri, {
    method: 'PUT',
    headers: {
      'Content-Type': videoContentType,
      'Content-Length': String(videoBuffer.byteLength),
    },
    body: videoBuffer,
  })

  return res
}

/**
 * (Optional) Add an uploaded video to a playlist.
 */
async function addToPlaylist(
  accessToken: string,
  playlistId: string,
  videoId: string
): Promise<void> {
  try {
    await $fetch(`${YOUTUBE_API_V3}/playlistItems?part=snippet`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: {
        snippet: {
          playlistId,
          resourceId: {
            kind: 'youtube#video',
            videoId,
          },
        },
      },
    })
  } catch (err) {
    // Non-fatal — log but don't fail the overall post
    console.error('[YouTube Provider] Failed to add video to playlist:', err)
  }
}

// ── Provider implementation ────────────────────────────────────

/**
 * YouTube social media provider using YouTube Data API v3.
 *
 * Supports uploading videos (and YouTube Shorts) via the resumable upload protocol.
 * YouTube does not support text-only or image-only posts — a video is always required.
 *
 * @example
 * ```ts
 * const result = await youtubeProvider.post({
 *   accountId: 'UCxxxx',            // YouTube channel ID (not used in upload URL but stored for reference)
 *   accessToken: 'ya29.xxx',
 *   content: 'Check out this car!', // Used as video description
 *   media: [{ url: 'https://r2.example.com/video.mp4', type: 'video', mimeType: 'video/mp4' }],
 *   options: {
 *     title: 'New 2025 GWM Tank 500',
 *     tags: ['GWM', 'Tank500', 'SUV'],
 *     isShort: true,
 *     privacyStatus: 'public',
 *   },
 * })
 * ```
 */
export const youtubeProvider: SocialPostProvider = {
  identifier: 'youtube',
  name: 'YouTube',

  async post(params: PostParams): Promise<PostResult> {
    const { accessToken, content, media, options = {} } = params
    const ytOptions = options as YouTubeOptions

    try {
      // YouTube requires at least one video
      const videos = media?.filter(m => m.type === 'video') || []
      if (videos.length === 0) {
        return failResult(
          'YouTube requires a video. Text-only and image-only posts are not supported.'
        )
      }

      const video = videos[0]!
      const videoContentType = resolveVideoContentType(video.mimeType)
      const title = buildVideoTitle(content, ytOptions)
      const categoryId = ytOptions.categoryId || '2' // Autos & Vehicles
      const privacyStatus = ytOptions.privacyStatus || 'public'
      const madeForKids = ytOptions.madeForKids ?? false

      // Build video metadata for the initiation request
      const metadata = {
        snippet: {
          title,
          description: content,
          tags: ytOptions.tags || [],
          categoryId,
        },
        status: {
          privacyStatus,
          selfDeclaredMadeForKids: madeForKids,
        },
      }

      // Step 1: Fetch the video binary from R2 first (we need the size for initiation)
      const videoBuffer = await fetchVideoBuffer(video.url)

      // Step 2: Initiate resumable upload session
      const uploadUri = await initiateResumableUpload(
        accessToken,
        metadata,
        videoContentType,
        videoBuffer.byteLength
      )

      // Step 3: Upload the video binary
      const videoResource = await uploadVideoToUri(uploadUri, videoBuffer, videoContentType)

      if (!videoResource?.id) {
        return failResult('YouTube upload completed but no video ID was returned.')
      }

      // Step 4 (optional): Add to playlist
      if (ytOptions.playlistId) {
        await addToPlaylist(accessToken, ytOptions.playlistId, videoResource.id)
      }

      // Build the public URL
      const videoUrl = ytOptions.isShort
        ? `https://youtube.com/shorts/${videoResource.id}`
        : `https://youtube.com/watch?v=${videoResource.id}`

      return {
        platformPostId: videoResource.id,
        url: videoUrl,
        status: 'success',
      }
    } catch (err: unknown) {
      console.error('[YouTube Provider] Upload failed:', err)
      return parseYouTubeError(err)
    }
  },

  /**
   * Post a comment on a YouTube video.
   *
   * Uses the commentThreads.insert endpoint to create a top-level comment.
   * Requires the `force-ssl` scope or `youtube.force-ssl` OAuth scope.
   */
  async comment(params: CommentParams): Promise<PostResult> {
    const { accessToken, postId, content } = params

    try {
      const res = await $fetch<{
        id: string
        snippet?: { topLevelComment?: { id?: string } }
      }>(`${YOUTUBE_API_V3}/commentThreads?part=snippet`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: {
          snippet: {
            videoId: postId,
            topLevelComment: {
              snippet: {
                textOriginal: content,
              },
            },
          },
        },
      })

      const commentId = res.snippet?.topLevelComment?.id || res.id

      return {
        platformPostId: commentId,
        url: `https://youtube.com/watch?v=${postId}&lc=${commentId}`,
        status: 'success',
      }
    } catch (err: unknown) {
      console.error('[YouTube Provider] Comment failed:', err)
      return parseYouTubeError(err)
    }
  },
}

// --- Slice 2 inbox: YouTube comments ---
/** Pure: map a YouTube commentThreads.list response to InboxItems + next cursor. */
export function mapYouTubeThreads(api: any): FetchInboxResult {
  const items: InboxItem[] = (api?.items ?? []).map((t: any) => {
    const c = t.snippet?.topLevelComment
    const s = c?.snippet ?? {}
    return {
      channelType: 'comment' as const,
      platformConversationId: String(t.snippet?.videoId ?? ''),
      permalink: t.snippet?.videoId ? `https://youtu.be/${t.snippet.videoId}` : undefined,
      participant: { id: s.authorChannelId?.value, name: s.authorDisplayName },
      platformMessageId: String(c?.id ?? ''),
      authorId: s.authorChannelId?.value,
      authorName: s.authorDisplayName,
      content: s.textDisplay ?? '',
      messageType: 'comment',
      platformTimestamp: s.publishedAt,
    }
  })
  return { items, nextCursor: api?.nextPageToken ?? null }
}

youtubeProvider.fetchInbox = async ({ accountId, accessToken, cursor }: FetchInboxParams): Promise<FetchInboxResult> => {
  const url = new URL(`${YOUTUBE_API_BASE}/youtube/v3/commentThreads`)
  url.searchParams.set('part', 'snippet')
  url.searchParams.set('allThreadsRelatedToChannelId', accountId) // platform_account_id = channel id
  url.searchParams.set('maxResults', '50')
  url.searchParams.set('order', 'time')
  if (cursor) url.searchParams.set('pageToken', cursor)
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
  if (!res.ok) throw new Error(`youtube fetchInbox ${res.status}`)
  return mapYouTubeThreads(await res.json())
}

youtubeProvider.reply = async ({ accessToken, conversationId, content }: ReplyParams): Promise<ReplyResult> => {
  // conversationId = the parent top-level comment id (the reply endpoint passes the latest inbound message id)
  const res = await fetch(`${YOUTUBE_API_BASE}/youtube/v3/comments?part=snippet`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ snippet: { parentId: conversationId, textOriginal: content } }),
  })
  const j: any = await res.json().catch(() => ({}))
  return res.ok
    ? { platformMessageId: String(j.id ?? ''), status: 'success' }
    : { platformMessageId: '', status: 'failed', error: j?.error?.message ?? `http ${res.status}` }
}
