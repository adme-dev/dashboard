import { boundedBody } from '../../../shared/pageStudio/boundedPrivateBody'
import { collectionDigest } from '../../../shared/pageStudio/collectionApi'
import { TransferRecoveryAdmissionRequestSchema, TransferRecoveryAdmissionAcknowledgmentSchema, TRANSFER_RECOVERY_ADMISSION_PATH, TRANSFER_RECOVERY_ADMISSION_URL, TRANSFER_RECOVERY_ADMISSION_UNAVAILABLE, TRANSFER_RECOVERY_ADMISSION_MAX_BYTES } from '../../../shared/pageStudio/transferRecoveryAdmissionTransport'

/** Existing private Control -> Management binding. No public fallback or cache. */
export async function readTransferRecoveryAdmissionThroughManagement(request: Request, dashboardOrigin: string, binding: unknown) {
  const headers = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }
  const failure = (status = 503) => Response.json(TRANSFER_RECOVERY_ADMISSION_UNAVAILABLE, { status, headers })
  const url = new URL(request.url)
  if (url.pathname !== TRANSFER_RECOVERY_ADMISSION_PATH || url.search || request.method !== 'POST') return failure(400)
  if (dashboardOrigin !== 'https://app.xeroflow.io') return failure()
  const service = binding as { fetch?: (request: Request) => Promise<Response> } | undefined
  if (typeof service?.fetch !== 'function') return failure()
  const call = service.fetch.bind(service)
  try {
    const body = await boundedBody(request, TRANSFER_RECOVERY_ADMISSION_MAX_BYTES)
    if (body.tooLarge) return failure(400)
    const parsed = TransferRecoveryAdmissionRequestSchema.safeParse(body.value)
    if (!parsed.success) return failure(400)
    const input = parsed.data, digest = await collectionDigest(input)
    const response = await call(new Request(TRANSFER_RECOVERY_ADMISSION_URL, { method: 'POST',
      body: JSON.stringify(input), redirect: 'manual', headers: { 'content-type': 'application/json' } }))
    if (!(response instanceof Response) || response.headers.get('x-request-digest') !== digest) return failure()
    const reply = await boundedBody(response, TRANSFER_RECOVERY_ADMISSION_MAX_BYTES)
    if (reply.tooLarge) return failure()
    if (response.status !== 200) return failure([400, 401, 403, 409, 503].includes(response.status)
      && reply.value === TRANSFER_RECOVERY_ADMISSION_UNAVAILABLE ? response.status : 503)
    const value = TransferRecoveryAdmissionAcknowledgmentSchema.safeParse(reply.value)
    if (!value.success || value.data.purpose !== input.purpose || value.data.envelopeDigest !== digest) return failure()
    return Response.json(value.data, { headers: { ...headers, 'x-request-digest': digest } })
  } catch { return failure() }
}
