import { boundedBody } from '../../../shared/pageStudio/boundedPrivateBody'
import { collectionDigest } from '../../../shared/pageStudio/collectionApi'
import { TransferRecoveryInspectionWireSchema, TransferRecoveryInspectionWireAcknowledgmentSchema, TRANSFER_RECOVERY_INSPECTION_PATH, TRANSFER_RECOVERY_INSPECTION_URL, TRANSFER_RECOVERY_INSPECTION_UNAVAILABLE } from '../../../shared/pageStudio/transferRecoveryInspectionTransport'

/** Existing private Control -> Management binding. No public fallback or cache. */
export async function inspectTransferRecoveryThroughManagement(request: Request, dashboardOrigin: string, binding: unknown) {
  const headers = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }
  const failure = (status = 503) => Response.json(TRANSFER_RECOVERY_INSPECTION_UNAVAILABLE, { status, headers })
  const url = new URL(request.url)
  if (url.pathname !== TRANSFER_RECOVERY_INSPECTION_PATH || url.search || request.method !== 'POST') return failure(400)
  if (dashboardOrigin !== 'https://app.xeroflow.io') return failure()
  const service = binding as { fetch?: (request: Request) => Promise<Response> } | undefined
  if (typeof service?.fetch !== 'function') return failure()
  const call = service.fetch.bind(service)
  try {
    const body = await boundedBody(request, 16384)
    if (body.tooLarge) return failure(400)
    const parsed = TransferRecoveryInspectionWireSchema.safeParse(body.value)
    if (!parsed.success) return failure(400)
    const input = parsed.data, digest = await collectionDigest(input)
    const response = await call(new Request(TRANSFER_RECOVERY_INSPECTION_URL, { method: 'POST',
      body: JSON.stringify(input), redirect: 'manual', headers: { 'content-type': 'application/json' } }))
    if (!(response instanceof Response) || response.headers.get('x-request-digest') !== digest) return failure()
    const reply = await boundedBody(response, 16384)
    if (reply.tooLarge) return failure()
    if (response.status !== 200) return failure([400, 401, 403, 409, 503].includes(response.status)
      && reply.value === TRANSFER_RECOVERY_INSPECTION_UNAVAILABLE ? response.status : 503)
    const value = TransferRecoveryInspectionWireAcknowledgmentSchema.safeParse(reply.value)
    if (!value.success || value.data.purpose !== input.purpose || value.data.envelopeDigest !== digest) return failure()
    return Response.json(value.data, { headers: { ...headers, 'x-request-digest': digest } })
  } catch { return failure() }
}
