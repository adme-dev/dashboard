import { createError, defineEventHandler, getHeader } from 'h3'
import { startGovernedSiteIntelligenceCrawl } from '~~/server/utils/siteIntelligence/crawlRunner'
import { claimDueSiteIntelligenceDomains } from '~~/server/utils/siteIntelligence/scheduler'

function envValue(event: Parameters<typeof getHeader>[0], name: string): string {
  const value = (event.context as { cloudflare?: { env?: Record<string, unknown> } }).cloudflare?.env?.[name]
  return (typeof value === 'string' ? value : process.env[name])?.trim() ?? ''
}

export default defineEventHandler(async (event) => {
  const expectedSecret = envValue(event, 'CRON_SECRET')
  if (!expectedSecret || getHeader(event, 'x-cron-secret') !== expectedSecret) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  if (envValue(event, 'SITE_INTELLIGENCE_ENABLED') !== 'true') {
    throw createError({ statusCode: 503, statusMessage: 'Site intelligence is disabled' })
  }

  const claimed = await claimDueSiteIntelligenceDomains(20, new Date())
  const results: Array<{ domainId: string, status: string, runId?: string }> = []

  for (const domain of claimed) {
    try {
      const result = await startGovernedSiteIntelligenceCrawl(event, { id: null }, domain.domainId, 'schedule')
      results.push({
        domainId: domain.domainId,
        status: result.status,
        ...(result.run?.id ? { runId: result.run.id } : {})
      })
    } catch {
      results.push({ domainId: domain.domainId, status: 'failed' })
    }
  }

  return {
    ok: true,
    claimed: claimed.length,
    started: results.filter(result => result.status === 'started').length,
    skipped: results.filter(result => ['active_run', 'inactive', 'not_found'].includes(result.status)).length,
    failed: results.filter(result => result.status === 'failed').length,
    results
  }
})
