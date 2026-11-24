import { createError, defineEventHandler, getHeader, getRequestWebStream, sendWebResponse } from 'h3'
import { requireAuth, requireWriteAccess } from '~~/server/utils/auth'
import { enforceRateLimit } from '~~/server/utils/rateLimit'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  await requireWriteAccess(event)
  await enforceRateLimit(event, { key: `thebrief-zip:${user.id}`, limit: 5, windowSeconds: 60, failureMode: 'closed' })
  if (!/^application\/(?:zip|octet-stream)(?:;|$)/i.test(getHeader(event, 'content-type') || '')) throw createError({ statusCode: 415, statusMessage: 'Choose a TheBrief HTML5 ZIP' })
  if (Number(getHeader(event, 'content-length')) > 64 * 1024 * 1024) throw createError({ statusCode: 413, statusMessage: 'TheBrief ZIP exceeds 64 MB' })
  const service = event.context.cloudflare?.env?.THEBRIEF_IMPORT as { fetch: (request: Request) => Promise<Response> } | undefined
  if (!service) throw createError({ statusCode: 503, statusMessage: 'TheBrief ZIP preparation is not available on this deployment' })
  // Forward binary streams: do not decode ZIP bytes or large package responses
  // in the edge isolate. The private container enforces actual streamed limits.
  const body = getRequestWebStream(event)
  if (!body) throw createError({ statusCode: 400, statusMessage: 'The ZIP upload is empty' })
  const response = await service.fetch(new Request('https://thebrief-import/prepare', {
    method: 'POST', body,
    headers: { 'content-type': 'application/zip', 'x-thebrief-filename': (getHeader(event, 'x-thebrief-filename') || 'TheBrief.zip').slice(0, 1000) },
    duplex: 'half'
  } as RequestInit))
  return sendWebResponse(event, response)
})
