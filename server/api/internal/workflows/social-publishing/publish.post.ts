import { defineEventHandler, getHeader, readBody, createError, type H3Event } from 'h3'
import { claimAndPublishSocialPost } from '~~/server/utils/socialPublishing/dispatch'
import {
  SOCIAL_PUBLISHING_WORKFLOW_KIND,
  normalizeSocialPublishingWorkflowPayload,
  socialPublishingWorkflowClaimStatuses,
  socialPublishingWorkflowMaxAttempts
} from '~~/server/utils/agencyWorkflows/socialPublishing'

/**
 * POST /api/internal/workflows/social-publishing/publish
 *
 * Pages-side callback for the standalone agency-workflows Worker. The Worker
 * owns durable scheduling/retries; Pages owns database access and provider
 * dispatch. Authentication is the x-workflow-secret header, and the route stays
 * disabled unless AGENCY_WORKFLOWS_ENABLED is explicitly true.
 */
export default defineEventHandler(async (event) => {
  requireWorkflowCallbackSecret(event)

  if (process.env.AGENCY_WORKFLOWS_ENABLED !== 'true') {
    throw createError({ statusCode: 503, statusMessage: 'Agency workflows are disabled' })
  }

  const payload = await readWorkflowPayload(event)
  const result = await claimAndPublishSocialPost({
    postId: payload.postId,
    clientId: payload.clientId,
    claimStatuses: socialPublishingWorkflowClaimStatuses(payload.trigger),
    maxAttempts: socialPublishingWorkflowMaxAttempts(payload.trigger),
    source: 'workflow',
    actorId: payload.requestedBy ?? null,
    auditAction: 'post_published'
  })

  return {
    ok: true,
    workflow: SOCIAL_PUBLISHING_WORKFLOW_KIND,
    postId: payload.postId,
    clientId: payload.clientId,
    result
  }
})

function requireWorkflowCallbackSecret(event: H3Event) {
  const expected = process.env.WORKFLOW_CALLBACK_SECRET?.trim() || process.env.WORKFLOW_SERVICE_SECRET?.trim()
  if (!expected) {
    throw createError({ statusCode: 503, statusMessage: 'WORKFLOW_CALLBACK_SECRET is not configured' })
  }
  if (getHeader(event, 'x-workflow-secret') !== expected) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
}

async function readWorkflowPayload(event: H3Event) {
  try {
    return normalizeSocialPublishingWorkflowPayload(await readBody(event))
  } catch (error) {
    throw createError({
      statusCode: 400,
      statusMessage: error instanceof Error ? error.message : 'Invalid workflow payload'
    })
  }
}
