import { createError } from 'h3'
import { z } from 'zod'
import { NativeRuntimeRecoveryProjection } from '~~/shared/pageStudio/nativeRuntimeRecoveryOperator'
import { collectionDigest } from '~~/shared/pageStudio/collectionApi'
import { TransferControlsRequestSchema, TransferControlsResponseSchema } from '~~/shared/pageStudio/transferControls'
import { TransferWorkflowRequestSchema, TransferWorkflowResponseSchema, TransferWorkflowPhases } from '~~/shared/pageStudio/transferWorkflow'
import { capturePageStudioRpcMethod } from './privateRpc'

const unavailable = () => createError({ statusCode: 503, statusMessage: 'Transfer status could not be confirmed. Refresh the saved request before continuing.' })
/** Thin private wire only. No local graph fallback or uncertain-call retries. */
export async function callTransferControls(input: unknown, env: Record<string, unknown>) {
  const call = capturePageStudioRpcMethod(env.PAGE_STUDIO_MANAGEMENT as Record<string, unknown> | undefined, 'transferControls')
  const request = TransferControlsRequestSchema.parse({ ...input as object, expectedEnvironment: env.PAGE_STUDIO_RELEASE_ENVIRONMENT })
  if (!call) throw unavailable()
  const digest = await collectionDigest(request)
  let raw: unknown
  try {
    raw = structuredClone(await call(structuredClone(request)))
  } catch {
    throw unavailable()
  }
  const result = TransferControlsResponseSchema.safeParse(raw)
  if (!result.success || result.data.requestDigest !== digest) throw unavailable()
  if (!result.data.ok) throw createError({ statusCode: result.data.error.statusCode, statusMessage: result.data.error.message })
  const value = result.data.value
  if (request.action === 'operator-list') {
    if (!value || !('requests' in value) || new Set(value.requests.map(row => row.requestId)).size !== value.requests.length
      || value.requests.some((row, index) => (request.cursor && row.requestId <= request.cursor)
        || (index > 0 && row.requestId <= value.requests[index - 1]!.requestId))
      || (value.nextCursor !== null && (value.requests.length !== 50 || value.nextCursor !== value.requests.at(-1)?.requestId))) throw unavailable()
  } else if (value === null) {
    if (request.action !== 'owner-status') throw unavailable()
  } else if ('requests' in value || value.siteId !== request.siteId || ('requestId' in request && value.requestId !== request.requestId)) throw unavailable()
  return value
}
export async function callTransferWorkflow(input: unknown, env: Record<string, unknown>) {
  const call = capturePageStudioRpcMethod(env.PAGE_STUDIO_MANAGEMENT as Record<string, unknown> | undefined, 'transferWorkflow')
  const request = TransferWorkflowRequestSchema.parse({ ...input as object, expectedEnvironment: env.PAGE_STUDIO_RELEASE_ENVIRONMENT })
  if (!call) throw unavailable()
  const digest = await collectionDigest(request)
  let raw: unknown
  try {
    raw = structuredClone(await call(structuredClone(request)))
  } catch {
    throw unavailable()
  }
  const result = TransferWorkflowResponseSchema.safeParse(raw)
  if (!result.success || result.data.requestDigest !== digest) throw unavailable()
  if (!result.data.ok) throw createError({ statusCode: result.data.error.statusCode, statusMessage: result.data.error.message })
  const value = result.data.value
  const phases = request.action === 'status' ? TransferWorkflowPhases : [request.phase]
  if (value.siteId !== request.siteId || value.requestId !== request.requestId || value.revision !== request.expectedRevision
    || value.phases.length !== phases.length || value.phases.some((phase, index) => phase.phase !== phases[index])) throw unavailable()
  return value
}

/** One fixed recovery RPC under the existing genuine operator HTTP boundary. */
export async function callNativeRuntimeRecovery(input: { siteId: string, requestId: string, reviewId?: string, action: 'prepare' | 'apply' | 'status', operator: { actorId: string, loginSessionHash: string } }, env: Record<string, unknown>) {
  const call = capturePageStudioRpcMethod(env.PAGE_STUDIO_MANAGEMENT as Record<string, unknown> | undefined, 'nativeRuntimeRecovery')
  if (!call || env.PAGE_STUDIO_RELEASE_ENVIRONMENT !== 'production') throw unavailable()
  const request = { ...input, expectedControlPlaneEnvironment: 'production' }
  const digest = await collectionDigest(request)
  const result = z.object({ ok: z.literal(true), requestDigest: z.string(), value: NativeRuntimeRecoveryProjection }).strict().parse(await call(request))
  if (result.requestDigest !== digest || result.value.siteId !== input.siteId || result.value.requestId !== input.requestId
    || (input.reviewId && result.value.reviewId !== input.reviewId)) throw unavailable()
  return result.value
}
