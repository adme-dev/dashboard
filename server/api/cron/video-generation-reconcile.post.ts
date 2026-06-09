import { queryRows } from '~~/server/utils/db'
import { mapVideoGenerationJobRow, markVideoGenerationJobFailed } from '~~/server/utils/video-generation/jobs'
import { finalizeVideoGenerationJob } from '~~/server/utils/video-generation/finalize'
import { makeMuapiProvider } from '~~/server/utils/video-generation/providers/muapiProvider'
import { reconcileRunningJob } from '~~/server/utils/video-generation/reconcile'

export default defineEventHandler(async (event) => {
  if (getHeader(event, 'x-cron-secret') !== process.env.CRON_SECRET) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  if (process.env.VIDEO_STUDIO_ENABLED !== 'true' || process.env.VIDEO_GENERATION_ENABLED !== 'true') {
    return { ran: false, reason: 'disabled' }
  }
  const muapi = makeMuapiProvider({
    apiKey: process.env.MUAPI_API_KEY ?? '',
    baseUrl: process.env.MUAPI_BASE_URL ?? 'https://api.muapi.ai/api/v1',
    webhookUrl: process.env.MUAPI_WEBHOOK_URL ?? '',
  })
  const rows = await queryRows(
    `SELECT * FROM video_generation_jobs
     WHERE status = 'running' AND started_at < now() - interval '2 minutes'
     ORDER BY started_at ASC LIMIT 25`
  )
  const deps = { providers: { muapi }, finalize: finalizeVideoGenerationJob, markFailed: markVideoGenerationJobFailed }
  let succeeded = 0, failed = 0, running = 0
  for (const row of rows) {
    const outcome = await reconcileRunningJob(mapVideoGenerationJobRow(row), deps).catch(() => 'skipped' as const)
    if (outcome === 'succeeded') succeeded++
    else if (outcome === 'failed') failed++
    else if (outcome === 'running') running++
  }
  return { ran: true, succeeded, failed, running, checked: rows.length }
})
