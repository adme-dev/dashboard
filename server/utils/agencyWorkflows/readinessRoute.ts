import type { H3Event } from 'h3'

import { requireRole } from '~~/server/utils/auth'
import { checkAgencyWorkflowReadiness } from '~~/server/utils/agencyWorkflows/client'
import { PERMISSIONS } from '~~/server/utils/permissions'

export async function getAgencyWorkflowReadiness(event: H3Event) {
  await requireRole(event, PERMISSIONS.ADMIN)
  return checkAgencyWorkflowReadiness(event)
}
