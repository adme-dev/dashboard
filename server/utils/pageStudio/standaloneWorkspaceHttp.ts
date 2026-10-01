import { createError, getCookie, getRouterParam, setHeader, type H3Event } from 'h3'
import { requireClientAuth } from '~~/server/utils/clientAuth'
import { digestPortalSessionToken } from '~~/server/utils/portalSession'
import { authorizeStandaloneSite, readStandaloneSiteWorkspace } from './standaloneWorkspace'
import { listPageStudioSubmissions } from './siteOperations'
import { pageStudioHttpError } from './http'

export async function handleStandaloneWorkspace(event: H3Event, operation: 'workspace' | 'submissions') {
  setHeader(event, 'cache-control', 'private, no-store')
  try {
    const user = await requireClientAuth(event)
    const input = { siteId: getRouterParam(event, 'siteId') ?? '', clientId: user.clientId, userId: user.id,
      tokenHash: await digestPortalSessionToken(getCookie(event, 'client_session_token') ?? '') }
    if (operation === 'workspace') return await readStandaloneSiteWorkspace(input, { bucket: event.context.cloudflare?.env?.PAGE_STUDIO_CHECKPOINTS })
    const scope = await authorizeStandaloneSite(input)
    const submissions = await listPageStudioSubmissions(scope.tenant_id, input.siteId)
    const current = await authorizeStandaloneSite(input)
    if (current.tenant_id !== scope.tenant_id) throw createError({ statusCode: 503, statusMessage: 'Website changed. Refresh before continuing.' })
    return { submissions }
  } catch (error) { pageStudioHttpError(error) }
}
