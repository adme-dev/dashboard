import { createError, getHeader, getRequestWebStream, getRouterParam, getQuery, setHeader, type H3Event } from 'h3'
import { requireClientAuth } from '~~/server/utils/clientAuth'
import { requireAgencyPageStudioAccess } from '~~/server/utils/pageStudio/access'
import { readPageStudioHistory, mutatePageStudioHistory, PageStudioHistoryError } from '~~/server/utils/pageStudio/draftHistory'
import type { PageStudioContentActor } from '~~/server/utils/pageStudio/businessContent'
import { PageStudioReleaseCheckpointError } from '~~/shared/pageStudio/checkpointReader'
import { PageStudioControlError } from '~~/server/utils/pageStudio/controlStore'

const MAX_CONTENT_BODY_BYTES = 8192

// Enforce observed bytes, including chunked requests; Content-Length is only a hint.
async function readContentBody(event: H3Event): Promise<unknown> {
  if (!/^application\/json(?:\s*;|$)/i.test(getHeader(event, 'content-type') ?? '')) {
    throw createError({ statusCode: 415, statusMessage: 'Draft history must be JSON' })
  }
  const oversized = () => createError({ statusCode: 413, statusMessage: 'Draft history request exceeds the size limit' })
  if (Number(getHeader(event, 'content-length')) > MAX_CONTENT_BODY_BYTES) throw oversized()
  const stream = getRequestWebStream(event)
  if (!stream) throw createError({ statusCode: 400, statusMessage: 'Draft history request is required' })
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value
      if (!(bytes instanceof Uint8Array)) throw createError({ statusCode: 400, statusMessage: 'Invalid draft history' })
      size += bytes.byteLength
      if (size > MAX_CONTENT_BODY_BYTES) {
        await reader.cancel('Content body limit exceeded')
        throw oversized()
      }
      chunks.push(bytes)
    }
  } finally { reader.releaseLock() }
  const body = new Uint8Array(size)
  let offset = 0
  for (const bytes of chunks) {
    body.set(bytes, offset)
    offset += bytes.byteLength
  }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body))
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Invalid draft history JSON' })
  }
}

export async function handlePageStudioHistory(event: H3Event, audience: 'agency' | 'portal', method: 'GET' | 'POST') {
  setHeader(event, 'cache-control', 'private, no-store')
  try {
    let actor: PageStudioContentActor
    if (audience === 'agency') {
      const { tenantId, user } = await requireAgencyPageStudioAccess(event, method === 'POST' ? 'PAGE_STUDIO_EDIT' : 'PAGE_STUDIO_VIEW')
      let canEdit = method === 'POST'
      if (!canEdit) {
        try {
          await requireAgencyPageStudioAccess(event, 'PAGE_STUDIO_EDIT')
          canEdit = true
        } catch (error) {
          if ((error as { statusCode?: number })?.statusCode !== 403) throw error
        }
      }
      actor = { role: 'agency', actorId: user.id, tenantId, canEdit }
    } else {
      const user = await requireClientAuth(event)
      actor = { role: 'client', actorId: user.id, clientId: user.clientId }
    }
    const request = {
      actor,
      siteId: getRouterParam(event, 'siteId') ?? '',
      bucket: event.context.cloudflare?.env?.PAGE_STUDIO_CHECKPOINTS
    }
    return method === 'GET'
      ? await readPageStudioHistory({ ...request, query: getQuery(event) })
      : await mutatePageStudioHistory({ ...request, body: await readContentBody(event) })
  } catch (error) {
    if (error instanceof PageStudioHistoryError || error instanceof PageStudioReleaseCheckpointError || error instanceof PageStudioControlError) {
      throw createError({ statusCode: error.statusCode, statusMessage: error.message, data: { code: error.code } })
    }
    throw error
  }
}
