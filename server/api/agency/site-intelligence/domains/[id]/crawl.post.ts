import { requireRole } from '~~/server/utils/auth'
import { isUuid, requireClientTrackingAccess, requireTrackingAudienceScope } from '~~/server/utils/tracking/analytics-access'
import { getSiteIntelligenceDomainForActor } from '~~/server/utils/siteIntelligence/repository'
import { startGovernedSiteIntelligenceCrawl } from '~~/server/utils/siteIntelligence/crawlRunner'

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

  const result = await startGovernedSiteIntelligenceCrawl(event, user, domainId!, 'manual')
  if (result.status !== 'started') {
    if (result.status === 'active_run') throw createError({ statusCode: 409, statusMessage: 'A crawl is already active' })
    if (result.status === 'inactive') throw createError({ statusCode: 409, statusMessage: 'The monitored domain is paused' })
    if (result.status === 'failed' && result.category === 'url_policy') {
      throw createError({ statusCode: 400, statusMessage: 'Public origin revalidation failed' })
    }
    if (result.status === 'failed') {
      throw createError({ statusCode: 502, statusMessage: 'Crawl workflow could not be started' })
    }
    throw createError({ statusCode: 404, statusMessage: 'Monitored domain not found' })
  }
  return { run: result.run }
})
