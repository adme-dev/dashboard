import { boundedBody } from '../../../shared/pageStudio/boundedPrivateBody'
import { collectionDigest } from '../../../shared/pageStudio/collectionApi'
import { TransferRecoveryAdmissionControlViewSchema } from '../../../shared/pageStudio/transferRecoveryAdmissionControl'
import { RecoveryAdmissionControlTransportSchema, matchesRecoveryAdmissionControl, RECOVERY_ADMISSION_CONTROL_URL, RECOVERY_ADMISSION_CONTROL_UNAVAILABLE } from '../../../shared/pageStudio/transferRecoveryAdmissionControlTransport'
import { controlCustomerTransferRecoveryAdmission } from '../../../server/utils/pageStudio/customerTransferRecoveryAdmissionControl'
import type { RunPageStudioTransaction } from '../../../shared/pageStudio/controlTypes'

export async function handleTransferRecoveryAdmissionControlFetch(request: Request, env: Record<string, unknown>, runTransaction: RunPageStudioTransaction) {
  const config = { ...env }, headers = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }
  if (request.url !== RECOVERY_ADMISSION_CONTROL_URL || request.method !== 'POST') return new Response('Not found', { status: 404, headers })
  let digest = '0'.repeat(64)
  const reply = (value: unknown, status = 200) => Response.json(value, { status, headers: { ...headers, 'x-request-digest': digest } })
  const configured = () => config.PAGE_STUDIO_RELEASE_ENVIRONMENT === 'production' && config.PAGE_STUDIO_CUSTOMER_PREVIEW_RUNTIME_ENABLED === 'true'
    && ['PAGE_STUDIO_RELEASE_ENVIRONMENT', 'PAGE_STUDIO_CUSTOMER_PREVIEW_RUNTIME_ENABLED', 'PAGE_STUDIO_PROVISIONING_ENVIRONMENT', 'PAGE_STUDIO_PROVISIONER'].every(key => config[key] === env[key])
  try {
    const body = await boundedBody(request, 16384)
    if (body.tooLarge) return reply(RECOVERY_ADMISSION_CONTROL_UNAVAILABLE, 400)
    digest = await collectionDigest(body.value)
    const parsed = RecoveryAdmissionControlTransportSchema.safeParse(body.value)
    if (!parsed.success) return reply(RECOVERY_ADMISSION_CONTROL_UNAVAILABLE, 400)
    if (!configured()) return reply(RECOVERY_ADMISSION_CONTROL_UNAVAILABLE, 503)
    try {
      const { expectedEnvironment: _environment, ...input } = parsed.data
      const value = TransferRecoveryAdmissionControlViewSchema.parse(await controlCustomerTransferRecoveryAdmission(input, { env, runTransaction }))
      if (!configured() || !matchesRecoveryAdmissionControl(value, parsed.data)) return reply(RECOVERY_ADMISSION_CONTROL_UNAVAILABLE, 503)
      return reply({ ok: true, requestDigest: digest, value })
    } catch (error) {
      const code = Number((error as { statusCode?: number })?.statusCode)
      return reply({ ok: false, requestDigest: digest, error: { statusCode: [400, 401, 403, 409, 503].includes(code) ? code : 503, message: RECOVERY_ADMISSION_CONTROL_UNAVAILABLE } })
    }
  } catch { return reply(RECOVERY_ADMISSION_CONTROL_UNAVAILABLE, 400) }
}
