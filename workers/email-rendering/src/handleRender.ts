import { EmailRenderRequestSchema, EmailRenderResponseSchema, RenderEnvironmentSchema, type EmailRenderResponse } from '../../../shared/emailRendering/contract'
import { MAX_RENDER_OUTPUT_BYTES, RenderBoundaryError, snapshotRenderInput } from '../../../shared/emailRendering/bounds'
import { renderTemplateDocumentLocally } from './render/document'
import { renderCustomerEmailPreview } from './customerPreview'

export function handleEmailRender(input: unknown, rawEnvironment: unknown): EmailRenderResponse {
  const env = RenderEnvironmentSchema.safeParse(rawEnvironment)
  const environment = env.success ? env.data : null
  let operation: 'document' | 'customer-preview' | null = null
  const fail = (code: 'INVALID_INPUT' | 'LIMIT_EXCEEDED' | 'UNAVAILABLE'): EmailRenderResponse => ({ version: 1, environment, operation, ok: false, error: { code } })
  if (!environment) return fail('UNAVAILABLE')
  try {
    const parsed = EmailRenderRequestSchema.safeParse(snapshotRenderInput(input))
    if (!parsed.success) return fail('INVALID_INPUT')
    const request = parsed.data
    operation = request.operation
    if (request.expectedEnvironment !== environment) return fail('UNAVAILABLE')
    const result = request.operation === 'document'
      ? { version: 1, environment, operation, ok: true, value: { html: renderTemplateDocumentLocally(request.document, request.options) } }
      : { version: 1, environment, operation, ok: true, value: renderCustomerEmailPreview(request.template, request.context) }
    return EmailRenderResponseSchema.parse(snapshotRenderInput(result, MAX_RENDER_OUTPUT_BYTES))
  } catch (error) {
    return fail(error instanceof RenderBoundaryError ? error.code : 'INVALID_INPUT')
  }
}
