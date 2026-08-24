import { enqueue } from '~~/server/utils/queue'
import { runAfterResponse } from '~~/server/utils/asyncBackground'
import { runGoogleAiMaxScheduledScans } from '~~/server/utils/googleAiMaxScheduler'
import { captureGoogleAiMaxCacheInvalidator } from '~~/server/utils/googleAiMaxCache'

export default eventHandler(async (event) => {
  const expectedSecret = process.env.CRON_SECRET
  const suppliedSecret = getHeader(event, 'x-cron-secret')
  if (!expectedSecret || suppliedSecret !== expectedSecret) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const observedAt = new Date().toISOString()

  // The real work (per-tenant Google Ads scans + KV cache invalidation) runs in the queue
  // consumer so it survives past the HTTP response — a bare waitUntil() promise here was
  // silently dropped by the Pages runtime, leaving scan runs stuck 'running' forever
  // (see .superpowers/waituntil-cron-verification.md). Local dev without a JOBS_QUEUE
  // binding falls back to the previous runAfterResponse behavior.
  await enqueue(event, 'google.aimax.readiness', { observedAt }, () => {
    const invalidateCache = captureGoogleAiMaxCacheInvalidator(event)
    const work = runGoogleAiMaxScheduledScans({ observedAt }).then(async (result) => {
      const tenants = new Set(result.results.filter(item => item.runId).map(item => item.tenantId))
      await Promise.all(Array.from(tenants, tenantId => invalidateCache(tenantId)))
      return result
    })
    runAfterResponse(event, work, 'google-ai-max-readiness-cron')
    return Promise.resolve()
  })

  return {
    ok: true,
    scheduled: true,
    startedAt: observedAt
  }
})
