/**
 * Client Portal - List video reviews
 * GET /api/portal/video-reviews
 * Tenant-scoped to the session client (never request input).
 */

import { requireClientAuth } from '~~/server/utils/clientAuth'
import { listVideoReviewsForClient } from '~~/server/utils/video/reviews'

export default defineEventHandler(async (event) => {
  const client = await requireClientAuth(event)
  return { reviews: await listVideoReviewsForClient(client.clientId) }
})
