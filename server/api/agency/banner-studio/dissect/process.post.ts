import { requireWriteAccess } from '~~/server/utils/auth'
import { dissectionSnapshot, loadDissection, prepareDissectionRetry } from '~~/server/utils/banner/dissectionJobs'
import { dispatchDissection } from '~~/server/utils/banner/dissectionDispatch'

/** Admit an explicit retry; processing belongs to the registered executor. */
export default defineEventHandler(async (event) => {
  const user = await requireWriteAccess(event)
  const body = await readBody(event)
  const jobId = body?.jobId
  if (!jobId || typeof jobId !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Missing jobId' })
  }
  if (body.retry !== undefined && typeof body.retry !== 'boolean') throw createError({ statusCode: 400, statusMessage: 'retry must be a boolean' })
  if (body.retry === true && (typeof body.expectedAttemptId !== 'string' || !body.expectedAttemptId || body.expectedAttemptId.length > 200)) {
    throw createError({ statusCode: 400, statusMessage: 'Retry requires the reviewed expectedAttemptId' })
  }
  const current = await loadDissection(jobId, user.id)
  if (body.retry !== true) return dissectionSnapshot(current)

  const queued = await prepareDissectionRetry(jobId, user.id, body.expectedAttemptId)
  if (queued) {
    await dispatchDissection(event, jobId, queued.manifest!.execution!.attemptId)
  } else {
    const latest = dissectionSnapshot(await loadDissection(jobId, user.id))
    // Lost responses and concurrent duplicate retries recover the newer snapshot.
    if (latest.execution.attemptId === body.expectedAttemptId && !['queued', 'analyzing', 'segmenting'].includes(latest.status)) {
      throw createError({ statusCode: 409, statusMessage: 'This job cannot be retried, or its attempt limit has been reached' })
    }
    return latest
  }
  return dissectionSnapshot(await loadDissection(jobId, user.id))
})
