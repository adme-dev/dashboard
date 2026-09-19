import { getRouterParam, readBody, setHeader, createError, type H3Event } from 'h3'
import { requireClientAuth } from '~~/server/utils/clientAuth'
import { requireAgencyPageStudioAccess } from './access'
import type { PageStudioContentActor } from './businessContent'
import { connectPageStudioContent, getPageStudioContentConnection } from './contentConnection'
import { pageStudioHttpError } from './http'

export async function handlePageStudioContentConnection(event: H3Event, audience: 'agency' | 'portal', method: 'GET' | 'POST') {
  setHeader(event, 'cache-control', 'private, no-store')
  try {
    let actor: PageStudioContentActor
    if (audience === 'agency') {
      const { tenantId, user } = await requireAgencyPageStudioAccess(event, 'PAGE_STUDIO_EDIT')
      actor = { role: 'agency', actorId: user.id, tenantId, canEdit: true }
    } else {
      const user = await requireClientAuth(event)
      if (!['admin', 'manager'].includes(user.role)) throw createError({ statusCode: 403, statusMessage: 'Website editing access denied' })
      actor = { role: 'client', actorId: user.id, clientId: user.clientId }
    }
    const request = { actor, event, siteId: getRouterParam(event, 'siteId') ?? '',
      env: (event.context as { cloudflare?: { env?: Record<string, unknown> } }).cloudflare?.env ?? {} }
    return method === 'GET'
      ? await getPageStudioContentConnection(request)
      : await connectPageStudioContent({ ...request, body: await readBody(event) })
  } catch (error) { pageStudioHttpError(error) }
}
