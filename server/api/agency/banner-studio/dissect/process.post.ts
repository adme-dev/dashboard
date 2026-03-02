import { requireAuth } from '~~/server/utils/auth'
import { runDissectionPipeline } from '../../../../utils/bannerDissectorPipeline'

/**
 * Manually trigger dissection processing.
 * Used as a fallback when the queue is unavailable, or to re-process a failed job.
 */
export default defineEventHandler(async (event) => {
  await requireAuth(event)

  const body = await readBody(event)
  const jobId = body?.jobId
  if (!jobId || typeof jobId !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Missing jobId' })
  }

  const manifest = await runDissectionPipeline(event, jobId)
  return manifest
})
