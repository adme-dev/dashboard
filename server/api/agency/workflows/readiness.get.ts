import { getAgencyWorkflowReadiness } from '~~/server/utils/agencyWorkflows/readinessRoute'

/**
 * GET /api/agency/workflows/readiness
 * Admin-only operational diagnostic for the Pages-to-Worker Workflow handoff.
 */
export default defineEventHandler(event => getAgencyWorkflowReadiness(event))
