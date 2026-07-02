import { createError, defineEventHandler, getQuery } from 'h3'

import { requireRole } from '~~/server/utils/auth'
import {
  getAgencyWorkflowStatus,
  type AgencyWorkflowKind
} from '~~/server/utils/agencyWorkflows/client'
import { SOCIAL_INBOX_AUTOMATION_WORKFLOW_KIND } from '~~/server/utils/agencyWorkflows/socialInboxAutomation'
import { SOCIAL_PUBLISHING_WORKFLOW_KIND } from '~~/server/utils/agencyWorkflows/socialPublishing'
import { PERMISSIONS } from '~~/server/utils/permissions'

/**
 * GET /api/agency/workflows/status?workflow=&instanceId=
 * Admin-only operational diagnostic for a single Cloudflare Workflow instance.
 */
export default defineEventHandler(async (event) => {
  await requireRole(event, PERMISSIONS.ADMIN)

  const query = getQuery(event)
  const workflow = typeof query.workflow === 'string' ? query.workflow.trim() : ''
  const instanceId = typeof query.instanceId === 'string' ? query.instanceId.trim() : ''

  if (!workflow || !instanceId) {
    throw createError({ statusCode: 400, statusMessage: 'workflow and instanceId are required' })
  }

  if (!isAgencyWorkflowKind(workflow)) {
    throw createError({ statusCode: 400, statusMessage: 'Unsupported workflow kind' })
  }

  return getAgencyWorkflowStatus(event, { workflow, instanceId })
})

function isAgencyWorkflowKind(input: string): input is AgencyWorkflowKind {
  return input === SOCIAL_PUBLISHING_WORKFLOW_KIND || input === SOCIAL_INBOX_AUTOMATION_WORKFLOW_KIND
}
