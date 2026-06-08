/**
 * Client Portal - Respond to a video review
 * POST /api/portal/video-reviews/:id/respond
 * Body: { action: 'approve' | 'reject' | 'revision_requested', notes?: string }
 * Requires canApproveWork. Tenant-scoped to the session client (never request input).
 */

import { z } from 'zod'
import { requireClientAuth } from '~~/server/utils/clientAuth'
import { respondVideoReview } from '~~/server/utils/video/reviews'

const BodySchema = z.object({
  action: z.enum(['approve', 'reject', 'revision_requested']),
  notes: z.string().max(2000).nullish()
})

export default defineEventHandler(async (event) => {
  const client = await requireClientAuth(event)
  if (!client.permissions.canApproveWork) {
    throw createError({ statusCode: 403, statusMessage: 'You do not have permission to approve work.' })
  }
  const id = getRouterParam(event, 'id')!
  const { action, notes } = BodySchema.parse(await readBody(event))
  const updated = await respondVideoReview(id, client.clientId, action, notes ?? null, client.id)
  if (!updated) throw createError({ statusCode: 404, statusMessage: 'Review not found' })
  return { review: updated }
})
