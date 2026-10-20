import { boundedBody } from '../../../shared/pageStudio/boundedPrivateBody'
import { z } from 'zod'
import { ContentAttachmentCompletionSchema } from '../../../shared/pageStudio/content-attachment'
import { requireMatchingCompletion } from '../../../shared/pageStudio/contentAttachmentCompletionReader'

const Result = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), value: ContentAttachmentCompletionSchema.nullable() }).strict(),
  z.object({ ok: z.literal(false), error: z.object({ code: z.string(), statusCode: z.number(), message: z.string() }).strict() }).strict()
])
const headers = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }
const errors = {
  CMS_COMPLETION_INVALID: { status: 400, message: 'Invalid CMS completion request' },
  CMS_COMPLETION_DENIED: { status: 403, message: 'CMS completion could not be verified' },
  CMS_COMPLETION_UNAVAILABLE: { status: 503, message: 'CMS completion authority is unavailable' }
} as const
function failure(code: keyof typeof errors) {
  const error = errors[code]
  return Response.json({ error: { code, message: error.message } }, { status: error.status, headers })
}

export async function readCompletionThroughManagement(request: Request, dashboardOrigin: string, binding: unknown): Promise<Response> {
  try {
    const body = await boundedBody(request)
    if (body.tooLarge) return Response.json({ error: { code: 'CMS_COMPLETION_TOO_LARGE', message: 'CMS completion request is too large' } }, { status: 413, headers })
    const parsed = ContentAttachmentCompletionSchema.safeParse(body.value)
    if (!parsed.success) return failure('CMS_COMPLETION_INVALID')
    const expectedEnvironment = dashboardOrigin === 'https://preview.agency-dashboard-6cm.pages.dev' ? 'staging' : 'production'
    if (parsed.data.scope.environment !== expectedEnvironment
      || !binding || typeof binding !== 'object' || !('readCompletion' in binding) || typeof binding.readCompletion !== 'function') {
      return failure('CMS_COMPLETION_UNAVAILABLE')
    }
    const result = Result.safeParse(await binding.readCompletion({ expectedEnvironment, completion: parsed.data }))
    if (!result.success) return failure('CMS_COMPLETION_UNAVAILABLE')
    if (!result.data.ok) {
      const { code, statusCode } = result.data.error
      if (Object.hasOwn(errors, code)) {
        const known = code as keyof typeof errors
        if (errors[known].status === statusCode) return failure(known)
      }
      return failure('CMS_COMPLETION_UNAVAILABLE')
    }
    const value = result.data.value === null ? null : requireMatchingCompletion(result.data.value, parsed.data)
    return Response.json(value, { headers })
  } catch {
    return failure('CMS_COMPLETION_UNAVAILABLE')
  }
}
