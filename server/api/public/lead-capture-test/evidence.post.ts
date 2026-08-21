import { allowRequest } from '~~/server/utils/leads/rateLimit'
import { leadCaptureTestService } from '~~/server/utils/leads/captureTestService'

export default defineEventHandler(async (event) => {
  const requestOrigin = getHeader(event, 'origin')
  setResponseHeader(event, 'Cache-Control', 'no-store')
  const limiter = allowRequest(`lead-capture-evidence:${requestOrigin || 'missing'}`, 120, 60_000)
  if (!limiter.allowed) throw createError({ statusCode: 429, statusMessage: 'Rate limited' })
  const contentLength = Number(getHeader(event, 'content-length') || 0)
  if (contentLength > 4096) throw createError({ statusCode: 413, statusMessage: 'Payload too large' })
  const run = await leadCaptureTestService.appendEvidence(await readBody(event), requestOrigin)
  return { ok: true, run }
})
