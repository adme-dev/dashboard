import { createError } from 'h3'
import { EmailRenderRequestSchema, EmailRenderResponseSchema, RenderEnvironmentSchema, type EmailRenderRequest, type EmailRendererClient } from '../../../../shared/emailRendering/contract'
import { MAX_RENDER_OUTPUT_BYTES, RenderBoundaryError, snapshotRenderInput } from '../../../../shared/emailRendering/bounds'

const failure = (code: 'INVALID_INPUT' | 'LIMIT_EXCEEDED' | 'UNAVAILABLE') => createError({
  statusCode: code === 'INVALID_INPUT' ? 400 : code === 'LIMIT_EXCEEDED' ? 413 : 503,
  statusMessage: code === 'INVALID_INPUT' ? 'Invalid email rendering input.' : code === 'LIMIT_EXCEEDED' ? 'Email rendering limit exceeded.' : 'Email rendering is temporarily unavailable.'
})

/** Cloudflare decorates RPC object results with an own Symbol.dispose method.
 * Preserve every payload descriptor for strict validation, omit only that root
 * transport method, and release the original result even when validation fails.
 * https://developers.cloudflare.com/workers/runtime-apis/rpc/lifecycle/
 */
function snapshotRpcReply(value: unknown): unknown {
  if (!value || typeof value !== 'object') return snapshotRenderInput(value, MAX_RENDER_OUTPUT_BYTES)
  const disposer = Object.getOwnPropertyDescriptor(value, Symbol.dispose)
  if (!disposer) return snapshotRenderInput(value, MAX_RENDER_OUTPUT_BYTES)
  if (disposer.get || disposer.set || typeof disposer.value !== 'function') throw failure('UNAVAILABLE')
  try {
    // All response envelopes have five root fields. Bound descriptor copying
    // before allocating; nested values still use the full byte/node/depth guard.
    if (Object.getOwnPropertyNames(value).length > 5) throw failure('UNAVAILABLE')
    const descriptors = Object.getOwnPropertyDescriptors(value)
    Reflect.deleteProperty(descriptors, Symbol.dispose)
    const payload = Object.create(Object.getPrototypeOf(value), descriptors)
    return snapshotRenderInput(payload, MAX_RENDER_OUTPUT_BYTES)
  } finally {
    disposer.value.call(value)
  }
}

/** Explicit environment and private service binding; no local or HTTP fallback. */
export function createEmailRenderer(env: Record<string, unknown>): EmailRendererClient {
  const environment = RenderEnvironmentSchema.safeParse(env.PAGE_STUDIO_RELEASE_ENVIRONMENT)
  const service = env.EMAIL_RENDERER as { render(input: EmailRenderRequest): Promise<unknown> } | undefined
  async function dispatch(input: Record<string, unknown>) {
    if (!environment.success || !service || typeof service.render !== 'function') throw failure('UNAVAILABLE')
    let request: EmailRenderRequest
    try {
      request = EmailRenderRequestSchema.parse(snapshotRenderInput({ version: 1, expectedEnvironment: environment.data, ...input }))
    } catch (error) {
      throw failure(error instanceof RenderBoundaryError ? error.code : 'INVALID_INPUT')
    }
    let response: ReturnType<typeof EmailRenderResponseSchema.parse>
    try {
      response = EmailRenderResponseSchema.parse(snapshotRpcReply(await service.render(request)))
    } catch {
      throw failure('UNAVAILABLE')
    }
    if (response.environment !== environment.data || response.operation !== request.operation) throw failure('UNAVAILABLE')
    if (response.ok === false) throw failure(response.error.code)
    return response
  }
  return {
    async renderDocument(document, options = {}) {
      const response = await dispatch({ operation: 'document', document, options })
      if (response.operation !== 'document') throw failure('UNAVAILABLE')
      return response.value.html
    },
    async renderCustomerPreview(template, context) {
      const response = await dispatch({ operation: 'customer-preview', template, context })
      if (response.operation !== 'customer-preview') throw failure('UNAVAILABLE')
      return response.value
    }
  }
}
