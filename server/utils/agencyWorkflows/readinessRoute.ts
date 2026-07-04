import type { H3Event } from 'h3'

import { checkAgencyWorkflowReadiness } from '~~/server/utils/agencyWorkflows/client'
import { requireAgencyWorkflowDiagnosticAccess } from '~~/server/utils/agencyWorkflows/diagnosticAuth'

export async function getAgencyWorkflowReadiness(event: H3Event) {
  await requireAgencyWorkflowDiagnosticAccess(event)
  return checkAgencyWorkflowReadiness(event)
}
