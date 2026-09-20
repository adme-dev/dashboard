import { getQuery, getRouterParam, setHeader, type H3Event } from 'h3'
import { requireClientAuth } from '~~/server/utils/clientAuth'
import { requireAgencyPageStudioAccess } from './access'
import { preparePageStudioContentLogin } from './contentNativeLogin'
import { readContentBody } from './businessContentHttp'
import { pageStudioHttpError } from './http'
import type { PageStudioContentActor } from './businessContent'
import { executePageStudioCollection, type CollectionOperation } from './collections'

export async function handlePageStudioCollection(
  event: H3Event,
  audience: 'agency' | 'portal',
  operation: CollectionOperation
) {
  setHeader(event, 'cache-control', 'private, no-store')
  try {
    const writing = operation.startsWith('write')
    let actor: PageStudioContentActor
    if (audience === 'agency') {
      const { tenantId, user } = await requireAgencyPageStudioAccess(
        event,
        writing ? 'PAGE_STUDIO_EDIT' : 'PAGE_STUDIO_VIEW'
      )
      let canEdit = writing
      if (!writing) {
        try {
          await requireAgencyPageStudioAccess(event, 'PAGE_STUDIO_EDIT')
          canEdit = true
        } catch (error) {
          if ((error as { statusCode?: number }).statusCode !== 403) throw error
        }
      }
      actor = { role: 'agency', actorId: user.id, tenantId, canEdit }
    } else {
      const user = await requireClientAuth(event)
      actor = { role: 'client', actorId: user.id, clientId: user.clientId }
    }
    const body = writing ? await readContentBody(event) : undefined
    const login = await preparePageStudioContentLogin(event, actor)
    const collectionId = getRouterParam(event, 'collectionId'),
      recordId = getRouterParam(event, 'recordId')
    return await executePageStudioCollection(
      {
        actor,
        login,
        siteId: getRouterParam(event, 'siteId') ?? '',
        env: (event.context as { cloudflare?: { env?: Record<string, unknown> } }).cloudflare?.env ?? {}
      },
      operation,
      {
        ...(getQuery(event) as Record<string, unknown>),
        ...(collectionId ? { collectionId } : {}),
        ...(recordId ? { recordId } : {}),
        ...(writing ? { body } : {})
      }
    )
  } catch (error) {
    pageStudioHttpError(error)
  }
}
