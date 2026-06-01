/**
 * TikTok Social Media Provider
 *
 * Implements the Content Posting API for publishing videos and photos to TikTok.
 * Uses "pull from URL" for videos (TikTok downloads from our public R2 URL)
 * and direct photo URLs for photo posts.
 *
 * API Reference: https://developers.tiktok.com/doc/content-posting-api-reference-direct-post
 *
 * Rate limits: 6 requests per minute per user token
 */

import type { SocialPostProvider, PostParams, PostResult, MediaItem } from './types'

const TIKTOK_API_BASE = 'https://open.tiktokapis.com/v2'

interface TikTokApiResponse {
  data: {
    publish_id?: string
  }
  error: {
    code: string
    message: string
    log_id: string
  }
}

/**
 * Publish a video to TikTok using the Direct Post (pull from URL) method.
 * TikTok will download the video from the provided public URL.
 */
async function postVideo(params: PostParams, videoUrl: string): Promise<PostResult> {
  const {
    privacy_level = 'PUBLIC_TO_EVERYONE',
    disable_comment = false,
    disable_duet = false,
    disable_stitch = false,
    brand_content_toggle = false,
    brand_organic_toggle = false,
    video_cover_timestamp_ms = 0,
  } = params.options || {}

  try {
    const response = await $fetch<TikTokApiResponse>(
      `${TIKTOK_API_BASE}/post/publish/video/init/`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${params.accessToken}`,
          'Content-Type': 'application/json; charset=UTF-8',
        },
        body: {
          post_info: {
            title: params.content.slice(0, 2200),
            privacy_level,
            disable_comment,
            disable_duet,
            disable_stitch,
            brand_content_toggle,
            brand_organic_toggle,
            video_cover_timestamp_ms,
          },
          source_info: {
            source: 'PULL_FROM_URL',
            video_url: videoUrl,
          },
        },
      }
    )

    if (response.error?.code && response.error.code !== 'ok') {
      console.error('[TikTok] Video post error:', response.error)
      return {
        platformPostId: '',
        url: '',
        status: 'failed',
        error: `TikTok error ${response.error.code}: ${response.error.message}`,
      }
    }

    const publishId = response.data?.publish_id || ''

    return {
      platformPostId: publishId,
      url: `https://www.tiktok.com/@${params.accountId}`,
      status: 'success',
    }
  } catch (error: unknown) {
    const err = error as { data?: TikTokApiResponse; statusCode?: number; message?: string }
    const apiError = err.data?.error
    const message = apiError
      ? `TikTok error ${apiError.code}: ${apiError.message}`
      : err.message || 'Unknown TikTok API error'

    console.error('[TikTok] Video post failed:', message)
    return {
      platformPostId: '',
      url: '',
      status: 'failed',
      error: message,
    }
  }
}

/**
 * Publish a photo post to TikTok using the Content Posting API.
 * Supports up to 35 images per post.
 */
async function postPhotos(params: PostParams, imageUrls: string[]): Promise<PostResult> {
  const {
    privacy_level = 'PUBLIC_TO_EVERYONE',
    disable_comment = false,
    brand_content_toggle = false,
    brand_organic_toggle = false,
  } = params.options || {}

  try {
    const response = await $fetch<TikTokApiResponse>(
      `${TIKTOK_API_BASE}/post/publish/content/init/`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${params.accessToken}`,
          'Content-Type': 'application/json; charset=UTF-8',
        },
        body: {
          post_info: {
            title: params.content.slice(0, 2200),
            privacy_level,
            disable_comment,
            brand_content_toggle,
            brand_organic_toggle,
          },
          source_info: {
            source: 'PULL_FROM_URL',
            photo_cover_index: 0,
            photo_images: imageUrls,
          },
          post_mode: 'DIRECT_POST',
          media_type: 'PHOTO',
        },
      }
    )

    if (response.error?.code && response.error.code !== 'ok') {
      console.error('[TikTok] Photo post error:', response.error)
      return {
        platformPostId: '',
        url: '',
        status: 'failed',
        error: `TikTok error ${response.error.code}: ${response.error.message}`,
      }
    }

    const publishId = response.data?.publish_id || ''

    return {
      platformPostId: publishId,
      url: `https://www.tiktok.com/@${params.accountId}`,
      status: 'success',
    }
  } catch (error: unknown) {
    const err = error as { data?: TikTokApiResponse; statusCode?: number; message?: string }
    const apiError = err.data?.error
    const message = apiError
      ? `TikTok error ${apiError.code}: ${apiError.message}`
      : err.message || 'Unknown TikTok API error'

    console.error('[TikTok] Photo post failed:', message)
    return {
      platformPostId: '',
      url: '',
      status: 'failed',
      error: message,
    }
  }
}

/**
 * TikTok social media provider.
 *
 * Supports video posts (via pull-from-URL) and photo posts.
 * Text-only posts are not supported by TikTok — at least one media item is required.
 *
 * @example
 * ```ts
 * const result = await tiktokProvider.post({
 *   accountId: 'user123',
 *   accessToken: 'tok_abc',
 *   content: 'Check out our latest vehicle! 🚗',
 *   media: [{ url: 'https://r2.example.com/video.mp4', type: 'video' }],
 *   options: { privacy_level: 'PUBLIC_TO_EVERYONE' },
 * })
 * ```
 */
export const tiktokProvider: SocialPostProvider = {
  identifier: 'tiktok',
  name: 'TikTok',

  async post(params: PostParams): Promise<PostResult> {
    const media = params.media || []

    // TikTok requires at least one media item
    if (media.length === 0) {
      return {
        platformPostId: '',
        url: '',
        status: 'failed',
        error: 'TikTok requires at least one image or video. Text-only posts are not supported.',
      }
    }

    const videos = media.filter((m: MediaItem) => m.type === 'video')
    const images = media.filter((m: MediaItem) => m.type === 'image')

    // Video post — use the first video
    if (videos.length > 0) {
      return postVideo(params, videos[0]!.url)
    }

    // Photo post — send all image URLs
    if (images.length > 0) {
      const imageUrls = images.map((m: MediaItem) => m.url)
      return postPhotos(params, imageUrls)
    }

    return {
      platformPostId: '',
      url: '',
      status: 'failed',
      error: 'No supported media found. Provide at least one image or video.',
    }
  },
}
