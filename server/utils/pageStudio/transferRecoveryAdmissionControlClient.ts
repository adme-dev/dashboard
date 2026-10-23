import { createError } from 'h3'
import { collectionDigest } from '~~/shared/pageStudio/collectionApi'
import { RecoveryAdmissionControlTransportSchema, RecoveryAdmissionControlResponseSchema, matchesRecoveryAdmissionControl, RECOVERY_ADMISSION_CONTROL_URL, RECOVERY_ADMISSION_CONTROL_UNAVAILABLE } from '~~/shared/pageStudio/transferRecoveryAdmissionControlTransport'
import { placedAuthorityFetch } from './placedAuthorityFetch'
/** Explicit one-step call. A lost reply never creates a fresh attempt. */
export async function callTransferRecoveryAdmissionControl(input: unknown, env: Record<string, unknown>) {
  const fail = () => createError({ statusCode: 503, statusMessage: RECOVERY_ADMISSION_CONTROL_UNAVAILABLE })
  const parsed = RecoveryAdmissionControlTransportSchema.safeParse({ ...input as object, expectedEnvironment: env.PAGE_STUDIO_RELEASE_ENVIRONMENT })
  if (!parsed.success) throw fail()
  const { request, value } = await placedAuthorityFetch(env.PAGE_STUDIO_MANAGEMENT, RECOVERY_ADMISSION_CONTROL_URL, parsed.data, RECOVERY_ADMISSION_CONTROL_UNAVAILABLE)
  const result = RecoveryAdmissionControlResponseSchema.safeParse(value)
  if (!result.success || result.data.requestDigest !== await collectionDigest(request)) throw fail()
  if (!result.data.ok) throw createError({ statusCode: result.data.error.statusCode, statusMessage: result.data.error.message })
  if (!matchesRecoveryAdmissionControl(result.data.value, request)) throw fail()
  return result.data.value
}
