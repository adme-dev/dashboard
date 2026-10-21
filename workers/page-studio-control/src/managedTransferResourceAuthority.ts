import { boundedBody } from '../../../shared/pageStudio/boundedPrivateBody'
import { collectionCanonical, collectionDigest } from '../../../shared/pageStudio/collectionApi'
import { ContentAttachmentRequestSchema } from '../../../shared/pageStudio/content-attachment'
import { ResourceAuthorityRequest, RESOURCE_AUTHORITY_URL, RESOURCE_AUTHORITY_ERROR } from '../../../shared/pageStudio/managedTransferResourceAuthority'

/** Production resource authority has no public fallback, retry or cached grant. */
export async function authorizeManagedResourceThroughManagement(request: Request, binding: unknown) {
  const headers = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }
  const failure = (status = 503) => Response.json({ error: { code: 'RESOURCE_AUTHORITY_UNAVAILABLE', message: RESOURCE_AUTHORITY_ERROR } }, { status, headers })
  const service = binding as { fetch?: (request: Request) => Promise<Response> } | undefined
  if (typeof service?.fetch !== 'function') return failure()
  const call = service.fetch.bind(service)
  try {
    const body = await boundedBody(request, 16384)
    if (body.tooLarge) return failure(400)
    const parsed = ResourceAuthorityRequest.safeParse({ expectedControlPlaneEnvironment: 'production', execution: body.value })
    if (!parsed.success) return failure(400)
    const input = structuredClone(parsed.data)
    const digest = await collectionDigest(input)
    const response = await call(new Request(RESOURCE_AUTHORITY_URL, { method: 'POST', body: JSON.stringify(input), redirect: 'manual', headers: { 'content-type': 'application/json' } }))
    if (!(response instanceof Response) || response.headers.get('x-request-digest') !== digest) return failure()
    const reply = await boundedBody(response, 16384)
    if (reply.tooLarge) return failure()
    if (response.status !== 200) return failure([400, 401, 403, 409, 503].includes(response.status) && reply.value === RESOURCE_AUTHORITY_ERROR ? response.status : 503)
    const value = ContentAttachmentRequestSchema.safeParse(reply.value)
    if (!value.success || collectionCanonical(value.data) !== collectionCanonical(input.execution.resourceRequest)) return failure()
    return Response.json(value.data, { headers })
  } catch { return failure() }
}
