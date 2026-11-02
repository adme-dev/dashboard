// GET /api/email/review/operations/:operationId — lost-reply readback of the
// caller's own committed receipt. 404 means it never committed: the identical
// request (same operationId and payload) is safe to retry.
import { createError, defineEventHandler, getRouterParam } from 'h3'
import { readReviewOperation } from '~~/server/utils/email-marketing/review'
import { requireReviewSession, reviewAuthorizer, reviewWorkflowEnabled } from '~~/server/utils/email-marketing/reviewHttp'

export default defineEventHandler(async (event) => {
  const workflowEnabled = reviewWorkflowEnabled(event)
  const session = await requireReviewSession(event)
  const result = await readReviewOperation(session.userId, String(getRouterParam(event, 'operationId') ?? ''), reviewAuthorizer(session), { workflowEnabled })
  if (!result) throw createError({ statusCode: 404, statusMessage: 'review_operation_not_found' })
  return result
})
