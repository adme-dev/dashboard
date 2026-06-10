// LEGACY/INERT: muapi-shaped webhook. The active CF AI Gateway transport is synchronous and
// never calls this. Kept for the future fal.ai async path (which will use ED25519, not this).
import { verifyMuapiSignature } from '~~/server/utils/video-generation/webhookAuth'
import { queryOne } from '~~/server/utils/db'
import { mapVideoGenerationJobRow, markVideoGenerationJobFailed } from '~~/server/utils/video-generation/jobs'
import { finalizeVideoGenerationJob } from '~~/server/utils/video-generation/finalize'
import { classifyMuapiWebhook } from '~~/server/utils/video-generation/webhookPayload'

export default defineEventHandler(async (event) => {
  if (process.env.VIDEO_GENERATION_ENABLED !== 'true') {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }
  const raw = await readRawBody(event)
  if (!raw) throw createError({ statusCode: 400, statusMessage: 'Empty body' })
  const sig = getHeader(event, 'x-muapi-signature') ?? ''
  const ok = await verifyMuapiSignature(String(raw), sig, process.env.MUAPI_WEBHOOK_SECRET ?? '')
  if (!ok) throw createError({ statusCode: 401, statusMessage: 'Invalid signature' })

  let payload: any
  try { payload = JSON.parse(String(raw)) } catch { throw createError({ statusCode: 400, statusMessage: 'Invalid JSON' }) }
  const requestId = payload.request_id ?? payload.id
  if (!requestId) throw createError({ statusCode: 400, statusMessage: 'Missing request id' })

  const row = await queryOne(`SELECT * FROM video_generation_jobs WHERE provider_request_id = $1`, [String(requestId)])
  if (!row) return { ok: true, ignored: 'unknown_request' }
  const job = mapVideoGenerationJobRow(row)
  if (job.status === 'succeeded' || job.status === 'failed') return { ok: true, ignored: 'already_terminal' }

  const decision = classifyMuapiWebhook(payload)
  if (decision.outcome === 'pending') return { ok: true, ignored: 'non_terminal_status' }
  if (decision.outcome === 'failed') {
    await markVideoGenerationJobFailed(job.id, decision.errorMessage ?? 'provider failed')
    return { ok: true, status: 'failed' }
  }
  try {
    await finalizeVideoGenerationJob(job, { status: 'succeeded', outputUrl: decision.outputUrl as string, actualCostCents: decision.actualCostCents })
  } catch (e: any) {
    await markVideoGenerationJobFailed(job.id, `finalize failed: ${e?.message ?? String(e)}`)
    return { ok: true, status: 'failed' }
  }
  return { ok: true, status: 'succeeded' }
})
