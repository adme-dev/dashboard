import { requireRole } from '~~/server/utils/auth'
import { startSiteIntelligenceCrawlWorkflow } from '~~/server/utils/agencyWorkflows/client'
import { isUuid, requireClientTrackingAccess, requireTrackingAudienceScope } from '~~/server/utils/tracking/analytics-access'
import {
  createSiteIntelligenceCrawlRun,
  failSiteIntelligenceRun,
  getSiteIntelligenceDomainForActor,
  markSiteIntelligenceRunWorkflowStarted
} from '~~/server/utils/siteIntelligence/repository'
import { assertPublicSiteOrigin } from '~~/server/utils/siteIntelligence/urlPolicy'

export default defineEventHandler(async (event) => {
  const user = await requireRole(event, ['owner', 'admin'])
  if (process.env.SITE_INTELLIGENCE_ENABLED !== 'true') {
    throw createError({ statusCode: 503, statusMessage: 'Site intelligence is disabled' })
  }
  const domainId = getRouterParam(event, 'id')
  if (!isUuid(domainId)) throw createError({ statusCode: 400, statusMessage: 'Invalid domain id' })
  const scope = await requireTrackingAudienceScope(event)
  const domain = await getSiteIntelligenceDomainForActor(scope.clientIds, domainId!)
  if (!domain) throw createError({ statusCode: 404, statusMessage: 'Monitored domain not found' })
  await requireClientTrackingAccess(event, domain.clientId)

  const created = await createSiteIntelligenceCrawlRun(user, domainId!, 'manual')
  if (created.status === 'active_run') throw createError({ statusCode: 409, statusMessage: 'A crawl is already active' })
  if (created.status === 'inactive') throw createError({ statusCode: 409, statusMessage: 'The monitored domain is paused' })
  if (created.status === 'not_found') throw createError({ statusCode: 404, statusMessage: 'Monitored domain not found' })
  const { run } = created

  try {
    await assertPublicSiteOrigin(String(run.settings.origin))
  } catch {
    await failSiteIntelligenceRun(run.id, run.clientId, 'url_policy', 'Public origin revalidation failed')
    throw createError({ statusCode: 400, statusMessage: 'Public origin revalidation failed' })
  }

  const started = await startSiteIntelligenceCrawlWorkflow(event, {
    runId: run.id,
    domainId: run.domainId,
    clientId: run.clientId,
    trigger: 'manual',
    requestedBy: user.id
  })
  if (!started.ok || !started.instanceId) {
    const summary = started.ok ? 'Workflow did not return an instance id' : started.error || started.reason
    await failSiteIntelligenceRun(run.id, run.clientId, 'workflow_start', summary)
    throw createError({ statusCode: 502, statusMessage: 'Crawl workflow could not be started' })
  }
  await markSiteIntelligenceRunWorkflowStarted(run.id, run.clientId, started.instanceId)
  return { run: { ...run, workflowInstanceId: started.instanceId, status: 'running' } }
})
