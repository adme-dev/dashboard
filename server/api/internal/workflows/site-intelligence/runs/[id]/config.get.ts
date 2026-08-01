import { isUuid } from '~~/server/utils/tracking/analytics-access'
import { getSiteIntelligenceRunConfig } from '~~/server/utils/siteIntelligence/repository'
import { requireSiteIntelligenceWorkflowAuth } from '~~/server/utils/siteIntelligence/workflowAuth'

export default defineEventHandler(async (event) => {
  requireSiteIntelligenceWorkflowAuth(event)
  const runId = getRouterParam(event, 'id')
  const query = getQuery(event)
  const clientId = typeof query.clientId === 'string' ? query.clientId : ''
  const domainId = typeof query.domainId === 'string' ? query.domainId : ''
  if (!isUuid(runId) || !isUuid(clientId) || !isUuid(domainId)) {
    throw createError({ statusCode: 400, statusMessage: 'Valid run, client, and domain ids are required' })
  }
  const run = await getSiteIntelligenceRunConfig(runId!, clientId, domainId)
  if (!run) throw createError({ statusCode: 404, statusMessage: 'Crawl run not found' })
  return { run }
})
