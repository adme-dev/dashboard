import { createError, getHeader, getRequestWebStream, getRouterParam, setHeader, type H3Event } from 'h3'
import { requireClientAuth } from '~~/server/utils/clientAuth'
import { requireAgencyPageStudioAccess } from '~~/server/utils/pageStudio/access'
import { readPageStudioEmailConfiguration, writePageStudioEmailConfiguration, type PageStudioEmailActor } from '~~/server/utils/pageStudio/emailConfiguration'
import { PageStudioEmailConfigurationError } from '~~/server/utils/pageStudio/emailConfiguration'

const MAX_CONTENT_BODY_BYTES = 8192

// Enforce observed bytes, including chunked requests; Content-Length is only a hint.
async function readContentBody(event: H3Event): Promise<unknown> {
  if (!/^application\/json(?:\s*;|$)/i.test(getHeader(event, 'content-type') ?? '')) {
    throw createError({ statusCode: 415, statusMessage: 'Email settings must be JSON' })
  }
  const oversized = () => createError({ statusCode: 413, statusMessage: 'Email settings exceed the size limit' })
  if (Number(getHeader(event, 'content-length')) > MAX_CONTENT_BODY_BYTES) throw oversized()
  const stream = getRequestWebStream(event)
  if (!stream) throw createError({ statusCode: 400, statusMessage: 'Email settings are required' })
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value
      if (!(bytes instanceof Uint8Array)) throw createError({ statusCode: 400, statusMessage: 'Invalid email settings' })
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
    throw createError({ statusCode: 400, statusMessage: 'Invalid email settings JSON' })
  }
}

export async function handlePageStudioEmailConfiguration(event: H3Event, audience: 'agency' | 'portal', method: 'GET' | 'PUT') {
  setHeader(event, 'cache-control', 'private, no-store')
  try {
    let actor: PageStudioEmailActor
    if (audience === 'agency') {
      const { tenantId, user } = await requireAgencyPageStudioAccess(event, method === 'PUT' ? 'PAGE_STUDIO_EDIT' : 'PAGE_STUDIO_VIEW')
      let canEdit = method === 'PUT'
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
      env: (event.context as { cloudflare?: { env?: Record<string, unknown> } }).cloudflare?.env ?? {}
    }
    return method === 'GET'
      ? await readPageStudioEmailConfiguration(request)
      : await writePageStudioEmailConfiguration({ ...request, body: await readContentBody(event) })
  } catch (error) {
    if (error instanceof PageStudioEmailConfigurationError) {
      throw createError({ statusCode: error.statusCode, statusMessage: error.message, data: { code: error.code } })
    }
    throw error
  }
}
