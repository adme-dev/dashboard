import { runAfterResponse } from '~~/server/utils/asyncBackground'
import { runGoogleAiMaxScheduledScans } from '~~/server/utils/googleAiMaxScheduler'
import { captureGoogleAiMaxCacheInvalidator } from '~~/server/utils/googleAiMaxCache'

export default eventHandler(async (event) => {
  const expectedSecret = process.env.CRON_SECRET
  const suppliedSecret = getHeader(event, 'x-cron-secret')
  if (!expectedSecret || suppliedSecret !== expectedSecret) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const invalidateCache = captureGoogleAiMaxCacheInvalidator(event)
  const work = runGoogleAiMaxScheduledScans({}).then(async (result) => {
    const tenants = new Set(result.results.filter(item => item.runId).map(item => item.tenantId))
    await Promise.all(Array.from(tenants, tenantId => invalidateCache(tenantId)))
    return result
  })
  runAfterResponse(event, work, 'google-ai-max-readiness-cron')

  return {
    ok: true,
    scheduled: true,
    startedAt: new Date().toISOString(),
  }
})
