import { createError, getHeader, getRequestWebStream, getRouterParam, setHeader, type H3Event } from 'h3'
import { queryOneFresh } from '~~/server/utils/db'
import { requireClientAuth } from '~~/server/utils/clientAuth'
import { requireAgencyPageStudioAccess } from '~~/server/utils/pageStudio/access'
import { readPageStudioBusinessContent, writePageStudioBusinessContent, type PageStudioContentActor } from '~~/server/utils/pageStudio/businessContent'
import { pageStudioHttpError } from '~~/server/utils/pageStudio/http'

const MAX_CONTENT_BODY_BYTES = 512_000

async function requireContentAgencyAccess(event: H3Event, permission: 'PAGE_STUDIO_VIEW' | 'PAGE_STUDIO_EDIT') {
  const access = await requireAgencyPageStudioAccess(event, permission)
  // Current Dashboard staff belong to one shared agency organisation. A selected
  // tenant cookie is only a preference, never a grant. Use the server-owned DB
  // association, bypassing KV/query caches and refusing absent or stale selection.
  const organisation = await queryOneFresh<{ tenant_id: string }>(`
    SELECT tenant_id FROM xero_org_connection
     WHERE tenant_id <> '__default__'
     ORDER BY updated_at DESC, tenant_id LIMIT 1
  `)
  if (!organisation || organisation.tenant_id !== access.tenantId) {
    throw createError({ statusCode: 403, statusMessage: 'Website organisation access denied' })
  }
  return access
}

// Enforce observed bytes, including chunked requests; Content-Length is only a hint.
async function readContentBody(event: H3Event): Promise<unknown> {
  if (!/^application\/json(?:\s*;|$)/i.test(getHeader(event, 'content-type') ?? '')) {
    throw createError({ statusCode: 415, statusMessage: 'Business content must be JSON' })
  }
  const oversized = () => createError({ statusCode: 413, statusMessage: 'Business content exceeds the size limit' })
  if (Number(getHeader(event, 'content-length')) > MAX_CONTENT_BODY_BYTES) throw oversized()
  const stream = getRequestWebStream(event)
  if (!stream) throw createError({ statusCode: 400, statusMessage: 'Business content is required' })
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value
      if (!(bytes instanceof Uint8Array)) throw createError({ statusCode: 400, statusMessage: 'Invalid business content' })
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
    throw createError({ statusCode: 400, statusMessage: 'Invalid business content JSON' })
  }
}

export async function handlePageStudioBusinessContent(event: H3Event, audience: 'agency' | 'portal', method: 'GET' | 'PUT') {
  setHeader(event, 'cache-control', 'private, no-store')
  try {
    let actor: PageStudioContentActor
    if (audience === 'agency') {
      const { tenantId, user } = await requireContentAgencyAccess(event, method === 'PUT' ? 'PAGE_STUDIO_EDIT' : 'PAGE_STUDIO_VIEW')
      let canEdit = method === 'PUT'
      if (!canEdit) {
        try {
          await requireContentAgencyAccess(event, 'PAGE_STUDIO_EDIT')
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
      ? await readPageStudioBusinessContent(request)
      : await writePageStudioBusinessContent({ ...request, body: await readContentBody(event) })
  } catch (error) { pageStudioHttpError(error) }
}
