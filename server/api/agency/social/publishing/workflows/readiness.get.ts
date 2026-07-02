import { requireRole } from '~~/server/utils/auth'
import { checkAgencyWorkflowReadiness } from '~~/server/utils/agencyWorkflows/client'
import { PERMISSIONS } from '~~/server/utils/permissions'

/**
 * GET /api/agency/social/publishing/workflows/readiness
 * Admin-only operational diagnostic for the Pages-to-Worker Workflow handoff.
 */
export default defineEventHandler(async (event) => {
  await requireRole(event, PERMISSIONS.ADMIN)
  return checkAgencyWorkflowReadiness(event)
})
