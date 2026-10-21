import { boundedBody } from '../../../shared/pageStudio/boundedPrivateBody'
import { collectionDigest } from '../../../shared/pageStudio/collectionApi'
import { ResourceAuthorityRequest, RESOURCE_AUTHORITY_URL, RESOURCE_AUTHORITY_ERROR } from '../../../shared/pageStudio/managedTransferResourceAuthority'
import { authorizeManagedTransferResources } from '../../../server/utils/pageStudio/managedTransferResources'
import type { RunPageStudioTransaction } from '../../../shared/pageStudio/controlTypes'

/** One unchanged fresh authority transaction per private callback. */
export async function handleManagedTransferResourceAuthorityFetch(request: Request, env: Record<string, unknown>, runTransaction: RunPageStudioTransaction) {
  const config = { ...env }
  const headers = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }
  if (request.url !== RESOURCE_AUTHORITY_URL || request.method !== 'POST') return new Response('Not found', { status: 404, headers })
  let digest = '0'.repeat(64)
  const reply = (value: unknown, status = 200) => Response.json(value, { status, headers: { ...headers, 'x-request-digest': digest } })
  try {
    const body = await boundedBody(request, 16384)
    if (body.tooLarge) return reply(RESOURCE_AUTHORITY_ERROR, 400)
    digest = await collectionDigest(body.value)
    const parsed = ResourceAuthorityRequest.safeParse(body.value)
    if (!parsed.success) return reply(RESOURCE_AUTHORITY_ERROR, 400)
    if (config.PAGE_STUDIO_RELEASE_ENVIRONMENT !== 'production' || config.PAGE_STUDIO_CUSTOMER_PREVIEW_RUNTIME_ENABLED !== 'true') return reply(RESOURCE_AUTHORITY_ERROR, 503)
    return reply(await authorizeManagedTransferResources(parsed.data.execution, { runTransaction }))
  } catch (error) {
    const status = Number((error as { statusCode?: unknown } | null)?.statusCode)
    return reply(RESOURCE_AUTHORITY_ERROR, [400, 401, 403, 409].includes(status) ? status : 503)
  }
}
