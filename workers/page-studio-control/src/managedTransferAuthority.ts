import { boundedBody } from '../../../shared/pageStudio/boundedPrivateBody'
import { collectionDigest } from '../../../shared/pageStudio/collectionApi'
import { TRANSFER_AUTHORITIES, TRANSFER_AUTHORITY_ORIGIN, TRANSFER_AUTHORITY_ERROR, transferAuthorityPath, transferAuthorityWire, matchingTransferAuthorityResult, type TransferAuthority } from '../../../shared/pageStudio/managedTransferAuthorityTransport'

/** Capture one fixed binding; never fall back to Pages or retry an uncertain call. */
export async function readManagedTransferAuthority(request: Request, key: TransferAuthority, binding: unknown) {
  const headers = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }
  const failure = (status = 503) => Response.json({ error: { code: 'TRANSFER_AUTHORITY_UNAVAILABLE', message: TRANSFER_AUTHORITY_ERROR } }, { status, headers })
  const service = binding as { fetch?: (request: Request) => Promise<Response> } | undefined
  if (typeof service?.fetch !== 'function') return failure()
  const call = service.fetch.bind(service), { maximum } = TRANSFER_AUTHORITIES[key]
  try {
    const body = await boundedBody(request, maximum)
    if (body.tooLarge) return failure(413)
    const parsed = transferAuthorityWire(key).safeParse({ expectedEnvironment: 'production', input: body.value })
    if (!parsed.success) return failure(400)
    const input = structuredClone(parsed.data), digest = await collectionDigest(input)
    const response = await call(new Request(TRANSFER_AUTHORITY_ORIGIN + transferAuthorityPath(key), { method: 'POST', body: JSON.stringify(input), redirect: 'manual', headers: { 'content-type': 'application/json' } }))
    if (!(response instanceof Response) || response.headers.get('x-request-digest') !== digest) return failure()
    const reply = await boundedBody(response, maximum)
    if (reply.tooLarge) return failure()
    if (response.status !== 200) return failure([400, 401, 403, 409, 413, 503].includes(response.status) && reply.value === TRANSFER_AUTHORITY_ERROR ? response.status : 503)
    return Response.json(matchingTransferAuthorityResult(key, input.input, reply.value), { headers })
  } catch { return failure() }
}
