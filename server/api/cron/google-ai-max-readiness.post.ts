import { runAfterResponse } from '~~/server/utils/asyncBackground'
import { runGoogleAiMaxScheduledScans } from '~~/server/utils/googleAiMaxScheduler'

export default eventHandler(async (event) => {
  const expectedSecret = process.env.CRON_SECRET
  const suppliedSecret = getHeader(event, 'x-cron-secret')
  if (!expectedSecret || suppliedSecret !== expectedSecret) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const work = runGoogleAiMaxScheduledScans({})
  runAfterResponse(event, work, 'google-ai-max-readiness-cron')

  return {
    ok: true,
    scheduled: true,
    startedAt: new Date().toISOString(),
  }
})
