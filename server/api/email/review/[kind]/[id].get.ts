// GET /api/email/review/:kind/:id?clientId= — review state, comments (with
// orphan/outdated lineage flags) and the block outline of saved content.
import { createError, defineEventHandler, getQuery, getRouterParam } from 'h3'
import { z } from 'zod'
import { getReviewView } from '~~/server/utils/email-marketing/review'
import { assertReviewWorkflowEnabled, requireReviewSession, reviewAuthorizer, ReviewKind } from '~~/server/utils/email-marketing/reviewHttp'

export default defineEventHandler(async (event) => {
  assertReviewWorkflowEnabled(event)
  const session = await requireReviewSession(event)
  const kind = ReviewKind.safeParse(getRouterParam(event, 'kind'))
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  if (!kind.success || !id.success) throw createError({ statusCode: 404, statusMessage: 'review_target_not_found' })
  // Optional scope the caller believes it is viewing ("none" = agency-owned).
  const rawClient = getQuery(event).clientId
  let expected: string | null | undefined
  if (rawClient === 'none') expected = null
  else if (rawClient !== undefined) {
    const parsed = z.string().uuid().safeParse(rawClient)
    if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'invalid_client_scope' })
    expected = parsed.data
  }
  return getReviewView(kind.data, id.data, expected, reviewAuthorizer(session))
})
