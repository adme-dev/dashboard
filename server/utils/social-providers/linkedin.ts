/**
 * LinkedIn Social Media Provider
 *
 * Implements the LinkedIn Posts API v2 (REST) for publishing text, image,
 * and video posts to personal profiles and organization pages.
 *
 * API Reference: https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api
 *
 * Image/video uploads use the initialize-upload → binary PUT → create-post flow.
 * For images from R2, we download the binary and re-upload to LinkedIn's upload URL.
 */

import type { SocialPostProvider, PostParams, PostResult, CommentParams, MediaItem } from './types'

const LINKEDIN_API_BASE = 'https://api.linkedin.com'
const LINKEDIN_VERSION = '202402'

/**
 * Build common LinkedIn REST headers.
 */
function linkedinHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    'LinkedIn-Version': LINKEDIN_VERSION,
    'X-Restli-Protocol-Version': '2.0.0',
    'Content-Type': 'application/json',
  }
}

/**
 * Build the author URN based on whether the account is an organization or person.
 */
function authorUrn(accountId: string, isOrganization: boolean): string {
  return isOrganization ? `urn:li:organization:${accountId}` : `urn:li:person:${accountId}`
}

/**
 * Upload a single image to LinkedIn.
 *
 * Flow:
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
    // Step 1: Initialize upload
    const initResponse = await $fetch<{
      value: {
        uploadUrl: string
        image: string
      }
    }>(`${LINKEDIN_API_BASE}/rest/images?action=initializeUpload`, {
      method: 'POST',
      headers: linkedinHeaders(accessToken),
      body: {
        initializeUploadRequest: {
          owner: ownerUrn,
        },
      },
    })

    const uploadUrl = initResponse.value?.uploadUrl
    const imageUrn = initResponse.value?.image

    if (!uploadUrl || !imageUrn) {
      return {
        error: 'LinkedIn image upload initialization failed: missing uploadUrl or image URN',
      }
    }

    // Step 2: Download binary from R2
    const imageBuffer = await $fetch<ArrayBuffer>(imageUrl, {
      responseType: 'arrayBuffer',
    })

    // Step 3: PUT binary to LinkedIn upload URL
    await $fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/octet-stream',
      },
      body: imageBuffer,
    })

    return { imageUrn }
  } catch (error: unknown) {
    const err = error as { message?: string }
    const message = err.message || 'Unknown error during LinkedIn image upload'
    console.error('[LinkedIn] Image upload failed:', message)
    return { error: message }
  }
}

/**
 * Upload a single video to LinkedIn.
 *
 * Flow:
 * 1. Initialize upload → get uploadUrl(s) and video URN
 * 2. Download binary from our R2 URL
 * 3. PUT binary to LinkedIn's uploadUrl
 * 4. Finalize upload
 * 5. Return the video URN
 */
async function uploadVideo(
  accessToken: string,
  ownerUrn: string,
  videoUrl: string
): Promise<{ videoUrn: string } | { error: string }> {
  try {
    // Step 1: Initialize upload
    const initResponse = await $fetch<{
      value: {
        uploadInstructions: Array<{ uploadUrl: string }>
        video: string
      }
    }>(`${LINKEDIN_API_BASE}/rest/videos?action=initializeUpload`, {
      method: 'POST',
      headers: linkedinHeaders(accessToken),
      body: {
        initializeUploadRequest: {
          owner: ownerUrn,
          fileSizeBytes: 0, // LinkedIn will accept without precise size for pull-based
          uploadCaptions: false,
          uploadThumbnail: false,
        },
      },
    })

    const uploadInstructions = initResponse.value?.uploadInstructions
    const videoUrn = initResponse.value?.video

    if (!uploadInstructions?.length || !videoUrn) {
      return {
        error:
          'LinkedIn video upload initialization failed: missing upload instructions or video URN',
      }
    }

    // Step 2: Download binary from R2
    const videoBuffer = await $fetch<ArrayBuffer>(videoUrl, {
      responseType: 'arrayBuffer',
    })

    // Step 3: Upload to LinkedIn (single chunk for most files)
    const firstUploadUrl = uploadInstructions[0]!.uploadUrl
    await $fetch(firstUploadUrl, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/octet-stream',
      },
      body: videoBuffer,
    })

    // Step 4: Finalize upload
    await $fetch(`${LINKEDIN_API_BASE}/rest/videos?action=finalizeUpload`, {
      method: 'POST',
      headers: linkedinHeaders(accessToken),
      body: {
        finalizeUploadRequest: {
          video: videoUrn,
          uploadToken: '',
          uploadedPartIds: [],
        },
      },
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
 * Create a text-only LinkedIn post.
 */
async function createTextPost(
  params: PostParams,
  author: string,
  visibility: string
): Promise<PostResult> {
  try {
    const response = await $fetch<{ id?: string }>(`${LINKEDIN_API_BASE}/rest/posts`, {
      method: 'POST',
      headers: linkedinHeaders(params.accessToken),
      body: {
        author,
        commentary: params.content.slice(0, 3000),
        visibility,
        distribution: {
          feedDistribution: 'MAIN_FEED',
          targetEntities: [],
          thirdPartyDistributionChannels: [],
        },
        lifecycleState: 'PUBLISHED',
      },
    })

    // LinkedIn returns the post ID in the response header `x-restli-id` or body
    const postId = response?.id || ''

    return {
      platformPostId: postId,
      url: postId ? `https://www.linkedin.com/feed/update/${postId}` : '',
      status: 'success',
    }
  } catch (error: unknown) {
    return handleLinkedInError(error, 'text post')
  }
}

/**
 * Create a LinkedIn post with a single image.
 */
async function createImagePost(
  params: PostParams,
  author: string,
  visibility: string,
  imageUrn: string,
  altText?: string
): Promise<PostResult> {
  try {
    const response = await $fetch<{ id?: string }>(`${LINKEDIN_API_BASE}/rest/posts`, {
      method: 'POST',
      headers: linkedinHeaders(params.accessToken),
      body: {
        author,
        commentary: params.content.slice(0, 3000),
        visibility,
        distribution: {
          feedDistribution: 'MAIN_FEED',
          targetEntities: [],
          thirdPartyDistributionChannels: [],
        },
        lifecycleState: 'PUBLISHED',
        content: {
          media: {
            title: altText || 'Image',
            id: imageUrn,
          },
        },
      },
    })

    const postId = response?.id || ''

    return {
      platformPostId: postId,
      url: postId ? `https://www.linkedin.com/feed/update/${postId}` : '',
      status: 'success',
    }
  } catch (error: unknown) {
    return handleLinkedInError(error, 'image post')
  }
}

/**
 * Create a LinkedIn post with multiple images (multi-image post).
 */
async function createMultiImagePost(
  params: PostParams,
  author: string,
  visibility: string,
  imageUrns: Array<{ urn: string; alt?: string }>
): Promise<PostResult> {
  try {
    const images = imageUrns.map(img => ({
      id: img.urn,
      altText: img.alt || '',
    }))

    const response = await $fetch<{ id?: string }>(`${LINKEDIN_API_BASE}/rest/posts`, {
      method: 'POST',
      headers: linkedinHeaders(params.accessToken),
      body: {
        author,
        commentary: params.content.slice(0, 3000),
        visibility,
        distribution: {
          feedDistribution: 'MAIN_FEED',
          targetEntities: [],
          thirdPartyDistributionChannels: [],
        },
        lifecycleState: 'PUBLISHED',
        content: {
          multiImage: {
            images,
          },
        },
      },
    })

    const postId = response?.id || ''

    return {
      platformPostId: postId,
      url: postId ? `https://www.linkedin.com/feed/update/${postId}` : '',
      status: 'success',
    }
  } catch (error: unknown) {
    return handleLinkedInError(error, 'multi-image post')
  }
}

/**
 * Create a LinkedIn post with a video.
 */
async function createVideoPost(
  params: PostParams,
  author: string,
  visibility: string,
  videoUrn: string
): Promise<PostResult> {
  try {
    const response = await $fetch<{ id?: string }>(`${LINKEDIN_API_BASE}/rest/posts`, {
      method: 'POST',
      headers: linkedinHeaders(params.accessToken),
      body: {
        author,
        commentary: params.content.slice(0, 3000),
        visibility,
        distribution: {
          feedDistribution: 'MAIN_FEED',
          targetEntities: [],
          thirdPartyDistributionChannels: [],
        },
        lifecycleState: 'PUBLISHED',
        content: {
          media: {
            title: 'Video',
            id: videoUrn,
          },
        },
      },
    })

    const postId = response?.id || ''

    return {
      platformPostId: postId,
      url: postId ? `https://www.linkedin.com/feed/update/${postId}` : '',
      status: 'success',
    }
  } catch (error: unknown) {
    return handleLinkedInError(error, 'video post')
  }
}

/**
 * Standardised error handler for LinkedIn API errors.
 */
function handleLinkedInError(error: unknown, context: string): PostResult {
  const err = error as { statusCode?: number; data?: { message?: string }; message?: string }
  let message: string

  if (err.statusCode === 401) {
    message = 'LinkedIn access token expired or invalid. Please re-authenticate.'
  } else if (err.statusCode === 403) {
    message =
      'Insufficient LinkedIn permissions. Check the app scopes (w_member_social or w_organization_social).'
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
    error: message,
  }
}

/**
 * LinkedIn social media provider.
 *
 * Supports text, image (single and multi), and video posts
 * to both personal profiles and organization/company pages.
 *
 * @example
 * ```ts
 * // Personal text post
 * const result = await linkedinProvider.post({
 *   accountId: 'abc123',
 *   accessToken: 'tok_xyz',
 *   content: 'Exciting news from our dealership!',
 * })
 *
 * // Organization image post
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
    const isOrganization = params.options?.isOrganization === true
    const visibility = params.options?.visibility === 'CONNECTIONS' ? 'CONNECTIONS' : 'PUBLIC'
    const author = authorUrn(params.accountId, isOrganization)

    const media = params.media || []
    const images = media.filter((m: MediaItem) => m.type === 'image')
    const videos = media.filter((m: MediaItem) => m.type === 'video')

    // --- Video post ---
    if (videos.length > 0) {
      const uploadResult = await uploadVideo(params.accessToken, author, videos[0]!.url)
      if ('error' in uploadResult) {
        return { platformPostId: '', url: '', status: 'failed', error: uploadResult.error }
      }
      return createVideoPost(params, author, visibility, uploadResult.videoUrn)
    }

    // --- Image post (single or multi) ---
    if (images.length > 0) {
      // Upload all images in parallel
      const uploadResults = await Promise.all(
        images.map(img => uploadImage(params.accessToken, author, img.url))
      )

      // Check for upload failures
      const failedUploads = uploadResults.filter(r => 'error' in r)
      if (failedUploads.length === uploadResults.length) {
        const firstError = (failedUploads[0] as { error: string }).error
        return {
          platformPostId: '',
          url: '',
          status: 'failed',
          error: `All image uploads failed: ${firstError}`,
        }
      }

      const successfulUrns = uploadResults
        .filter((r): r is { imageUrn: string } => 'imageUrn' in r)
        .map((r, i) => ({ urn: r.imageUrn, alt: images[i]?.alt }))

      if (successfulUrns.length === 1) {
        return createImagePost(
          params,
          author,
          visibility,
          successfulUrns[0]!.urn,
          successfulUrns[0]!.alt
        )
      }

      return createMultiImagePost(params, author, visibility, successfulUrns)
    }

    // --- Text-only post ---
    if (params.content.trim()) {
      return createTextPost(params, author, visibility)
    }

    return {
      platformPostId: '',
      url: '',
      status: 'failed',
      error: 'LinkedIn post requires either text content or media.',
    }
  },

  async comment(params: CommentParams): Promise<PostResult> {
    try {
      const postUrn = encodeURIComponent(params.postId)

      const response = await $fetch<{ id?: string }>(
        `${LINKEDIN_API_BASE}/rest/socialActions/${postUrn}/comments`,
        {
          method: 'POST',
          headers: linkedinHeaders(params.accessToken),
          body: {
            actor: `urn:li:person:${params.accountId}`,
            message: {
              text: params.content.slice(0, 1250),
            },
          },
        }
      )

      const commentId = response?.id || ''

      return {
        platformPostId: commentId,
        url: '',
        status: 'success',
      }
    } catch (error: unknown) {
      return handleLinkedInError(error, 'comment')
    }
  },
}
