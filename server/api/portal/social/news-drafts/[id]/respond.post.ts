import { queryRows, transaction } from '~~/server/utils/db'
import { requireClientAuth } from '~~/server/utils/clientAuth'
import {
  respondToPortalSocialNewsDraft,
  type PortalSocialNewsAction
} from '~~/server/utils/socialNewsPortal'
import { isUUID } from '~~/server/utils/ids'

/** POST /api/portal/social/news-drafts/:id/respond — client decision only; never dispatches. */
export default defineEventHandler(async (event) => {
  const clientUser = await requireClientAuth(event)
  if (!clientUser.permissions.canApproveWork) {
    throw createError({ statusCode: 403, statusMessage: 'You do not have permission to respond to approvals' })
  }

  const postId = getRouterParam(event, 'id')
  if (!postId) throw createError({ statusCode: 400, statusMessage: 'News draft ID is required' })
  if (!isUUID(postId)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid news draft ID' })
  }

  const body = await readBody<{ action?: unknown, feedback?: unknown }>(event)
  const allowed = new Set<PortalSocialNewsAction>(['approve', 'reject', 'request_changes'])
  if (typeof body?.action !== 'string' || !allowed.has(body.action as PortalSocialNewsAction)) {
    throw createError({ statusCode: 400, statusMessage: 'Valid action is required' })
  }
  if (body.feedback != null && typeof body.feedback !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Feedback must be text' })
  }
  const feedback = typeof body.feedback === 'string' ? body.feedback.trim() : ''
  if (feedback.length > 4_000) {
    throw createError({ statusCode: 400, statusMessage: 'Feedback must be 4000 characters or fewer' })
  }
  if ((body.action === 'reject' || body.action === 'request_changes') && !feedback) {
    throw createError({ statusCode: 400, statusMessage: 'Feedback is required for this action' })
  }

  return respondToPortalSocialNewsDraft(
    { queryRows, transaction },
    {
      clientId: clientUser.clientId,
      clientUserId: clientUser.id,
      postId,
      action: body.action as PortalSocialNewsAction,
      feedback: feedback || null
    }
  )
})
