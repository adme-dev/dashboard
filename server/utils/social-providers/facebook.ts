/**
 * Facebook Pages Provider
 *
 * Posts content to Facebook Pages using the Meta Graph API v20.0.
 * Supports text posts, photo posts (single & carousel), video/Reels, link posts, and comments.
 *
 * Reference: https://developers.facebook.com/docs/pages-api/posts
 * Reference: https://developers.facebook.com/docs/video-api/guides/reels-publishing
 */

import type { SocialPostProvider, PostParams, PostResult, CommentParams, MediaItem } from './types'

const GRAPH_API_BASE = 'https://graph.facebook.com/v20.0'

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
  const raw = err as { data?: GraphAPIError; statusCode?: number; message?: string }
  const graphErr = raw?.data?.error

  // Rate limit
  if (
    raw?.statusCode === 429 ||
    graphErr?.code === 4 ||
    graphErr?.code === 32 ||
    (graphErr?.type === 'OAuthException' && graphErr?.message?.toLowerCase().includes('rate'))
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
      `Content policy violation: ${graphErr?.message || "Your post was flagged by Facebook's content policies."}`
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
  const res = await $fetch<{ id: string }>(`${GRAPH_API_BASE}/${pageId}/photos`, {
    method: 'POST',
    body: {
      url: imageUrl,
      published: false,
      access_token: accessToken,
    },
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
        const res = await $fetch<{ id: string }>(`${GRAPH_API_BASE}/${accountId}/feed`, {
          method: 'POST',
          body: {
            message: content,
            link: options.link,
            access_token: accessToken,
          },
        })
        return {
          platformPostId: res.id,
          url: buildPostUrl(res.id),
          status: 'success',
        }
      }

      // ── No media: text-only post ─────────────────────
      if (!media?.length) {
        const res = await $fetch<{ id: string }>(`${GRAPH_API_BASE}/${accountId}/feed`, {
          method: 'POST',
          body: {
            message: content,
            access_token: accessToken,
          },
        })
        return {
          platformPostId: res.id,
          url: buildPostUrl(res.id),
          status: 'success',
        }
      }

      // ── Video post (Reels) ───────────────────────────
      const videos = media.filter(m => m.type === 'video')
      if (videos.length > 0) {
        const video = videos[0]!
        const res = await $fetch<{ id: string }>(`${GRAPH_API_BASE}/${accountId}/videos`, {
          method: 'POST',
          body: {
            file_url: video.url,
            description: content,
            access_token: accessToken,
          },
        })
        return {
          platformPostId: res.id,
          url: `https://www.facebook.com/${accountId}/videos/${res.id}`,
          status: 'success',
        }
      }

      // ── Single photo post ────────────────────────────
      const images = media.filter(m => m.type === 'image')
      if (images.length === 1) {
        // Upload as unpublished, then attach to a feed post for consistent URL format
        const photoId = await uploadUnpublishedPhoto(accountId, accessToken, images[0]!.url)

        const res = await $fetch<{ id: string }>(`${GRAPH_API_BASE}/${accountId}/feed`, {
          method: 'POST',
          body: {
            message: content,
            attached_media: [{ media_fbid: photoId }],
            access_token: accessToken,
          },
        })

        return {
          platformPostId: res.id,
          url: buildPostUrl(res.id),
          status: 'success',
        }
      }

      // ── Multi-photo carousel post ────────────────────
      if (images.length > 1) {
        // Upload all photos as unpublished in parallel
        const photoIds = await Promise.all(
          images.map(img => uploadUnpublishedPhoto(accountId, accessToken, img.url))
        )

        const attachedMedia = photoIds.map(id => ({ media_fbid: id }))

        const res = await $fetch<{ id: string }>(`${GRAPH_API_BASE}/${accountId}/feed`, {
          method: 'POST',
          body: {
            message: content,
            attached_media: attachedMedia,
            access_token: accessToken,
          },
        })

        return {
          platformPostId: res.id,
          url: buildPostUrl(res.id),
          status: 'success',
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
      const res = await $fetch<{ id: string }>(`${GRAPH_API_BASE}/${postId}/comments`, {
        method: 'POST',
        body: {
          message: content,
          access_token: accessToken,
        },
      })

      return {
        platformPostId: res.id,
        url: `https://www.facebook.com/${postId}`,
        status: 'success',
      }
    } catch (err: unknown) {
      console.error('[Facebook Provider] Comment failed:', err)
      return parseGraphError(err)
    }
  },
}
