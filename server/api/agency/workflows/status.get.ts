import { createError, defineEventHandler, getQuery } from 'h3'

import { requireRole } from '~~/server/utils/auth'
import {
  getAgencyWorkflowStatus,
  type AgencyWorkflowKind
} from '~~/server/utils/agencyWorkflows/client'
import {
  SOCIAL_INBOX_AUTOMATION_WORKFLOW_KIND,
  buildSocialInboxAutomationWorkflowInstanceId,
  normalizeSocialInboxAutomationWorkflowPayload
} from '~~/server/utils/agencyWorkflows/socialInboxAutomation'
import {
  SOCIAL_PUBLISHING_WORKFLOW_KIND,
  buildSocialPublishingWorkflowInstanceId,
  normalizeSocialPublishingWorkflowPayload
} from '~~/server/utils/agencyWorkflows/socialPublishing'
import { PERMISSIONS } from '~~/server/utils/permissions'

/**
 * GET /api/agency/workflows/status?workflow=&instanceId=
 * GET /api/agency/workflows/status?workflow=social.post.publish&clientId=&postId=&scheduledAt=
 * GET /api/agency/workflows/status?workflow=social.inbox.automation&clientId=&conversationId=&messageId=
 * Admin-only operational diagnostic for a single Cloudflare Workflow instance. Operators may pass an
 * exact instanceId or the workflow payload identity fields used to derive the deterministic instanceId.
 */
export default defineEventHandler(async (event) => {
  await requireRole(event, PERMISSIONS.ADMIN)

  const query = getQuery(event)
  const workflow = typeof query.workflow === 'string' ? query.workflow.trim() : ''

  if (!workflow) {
    throw createError({ statusCode: 400, statusMessage: 'workflow is required' })
  }

  if (!isAgencyWorkflowKind(workflow)) {
    throw createError({ statusCode: 400, statusMessage: 'Unsupported workflow kind' })
  }

  const instanceId = resolveWorkflowInstanceId(workflow, query)

  return getAgencyWorkflowStatus(event, { workflow, instanceId })
})

function isAgencyWorkflowKind(input: string): input is AgencyWorkflowKind {
  return input === SOCIAL_PUBLISHING_WORKFLOW_KIND || input === SOCIAL_INBOX_AUTOMATION_WORKFLOW_KIND
}

function resolveWorkflowInstanceId(workflow: AgencyWorkflowKind, query: Record<string, unknown>): string {
  const explicit = queryText(query.instanceId)
  if (explicit) return explicit

  try {
    if (workflow === SOCIAL_PUBLISHING_WORKFLOW_KIND) {
      return buildSocialPublishingWorkflowInstanceId(normalizeSocialPublishingWorkflowPayload({
        kind: workflow,
        clientId: query.clientId,
        postId: query.postId,
        scheduledAt: query.scheduledAt,
        trigger: query.trigger || 'manual'
      }))
    }

    return buildSocialInboxAutomationWorkflowInstanceId(normalizeSocialInboxAutomationWorkflowPayload({
      kind: workflow,
      clientId: query.clientId,
      conversationId: query.conversationId,
      messageId: query.messageId,
      trigger: query.trigger || 'inbound'
    }))
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'instanceId or workflow identity fields are required' })
  }
}

function queryText(input: unknown): string {
  return typeof input === 'string' ? input.trim() : ''
}
