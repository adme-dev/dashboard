import type { H3Event } from 'h3'

export function requireSiteIntelligenceWorkflowAuth(event: H3Event): void {
  const expected = process.env.WORKFLOW_CALLBACK_SECRET?.trim() || process.env.WORKFLOW_SERVICE_SECRET?.trim()
  if (!expected) throw createError({ statusCode: 503, statusMessage: 'Workflow callback authentication is not configured' })
  if (getHeader(event, 'x-workflow-secret') !== expected) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid workflow callback authentication' })
  }
}
