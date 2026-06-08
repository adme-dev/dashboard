/**
 * Client Portal - Get one video review + a fresh playable URL
 * GET /api/portal/video-reviews/:id
 * Tenant-scoped to the session client (never request input).
 */

import { requireClientAuth } from '~~/server/utils/clientAuth'
import { getVideoReviewForClient } from '~~/server/utils/video/reviews'
import { getPresignedDownloadUrl, getPublicUrl, isStorageConfigured } from '~~/server/utils/storage'

export default defineEventHandler(async (event) => {
  const client = await requireClientAuth(event)
  const id = getRouterParam(event, 'id')!
  const review = await getVideoReviewForClient(id, client.clientId)
  if (!review) throw createError({ statusCode: 404, statusMessage: 'Review not found' })
  const videoUrl = isStorageConfigured()
    ? (getPublicUrl(review.r2Key) ?? await getPresignedDownloadUrl(review.r2Key, 60 * 60))
    : `/api/_uploads/${review.r2Key}`
  return { review, videoUrl }
})
