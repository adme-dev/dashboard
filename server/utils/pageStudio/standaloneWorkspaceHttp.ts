import { createError, getCookie, getRouterParam, sendStream, setHeader, type H3Event } from 'h3'
import { requireClientAuth } from '~~/server/utils/clientAuth'
import { digestPortalSessionToken } from '~~/server/utils/portalSession'
import { authorizeStandaloneSite, readStandaloneSiteWorkspace } from './standaloneWorkspace'
import { listPageStudioSubmissions } from './siteOperations'
import { pageStudioHttpError } from './http'
import { readStandaloneMedia } from './standaloneMedia'

export async function handleStandaloneWorkspace(event: H3Event, operation: 'workspace' | 'submissions' | 'asset') {
  setHeader(event, 'cache-control', 'private, no-store')
  try {
    const user = await requireClientAuth(event)
    const input = { siteId: getRouterParam(event, 'siteId') ?? '', clientId: user.clientId, userId: user.id,
      tokenHash: await digestPortalSessionToken(getCookie(event, 'client_session_token') ?? '') }
    if (operation === 'asset') {
      const image = await readStandaloneMedia(input, getRouterParam(event, 'assetId') ?? '', { bucket: event.context.cloudflare?.env?.MEDIA_BUCKET })
      setHeader(event, 'Content-Type', image.mediaType)
      setHeader(event, 'Content-Length', image.size)
      setHeader(event, 'X-Content-Type-Options', 'nosniff')
      setHeader(event, 'Content-Security-Policy', 'default-src \'none\'; sandbox')
      setHeader(event, 'Cross-Origin-Resource-Policy', 'same-origin')
      return sendStream(event, image.body)
    }
    if (operation === 'workspace') return await readStandaloneSiteWorkspace(input, { bucket: event.context.cloudflare?.env?.PAGE_STUDIO_CHECKPOINTS })
    const scope = await authorizeStandaloneSite(input)
    const submissions = await listPageStudioSubmissions(scope.tenant_id, input.siteId)
    const current = await authorizeStandaloneSite(input)
    if (current.tenant_id !== scope.tenant_id) throw createError({ statusCode: 503, statusMessage: 'Website changed. Refresh before continuing.' })
    return { submissions }
  } catch (error) { pageStudioHttpError(error) }
}
