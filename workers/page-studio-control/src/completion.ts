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

async function boundedBody(request: Request) {
  const reader = request.body?.getReader()
  if (!reader) return { tooLarge: false, value: null }
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 4096) {
        await reader.cancel()
        return { tooLarge: true, value: null }
      }
      chunks.push(value)
    }
  } finally { reader.releaseLock() }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  try {
    return { tooLarge: false, value: JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes)) as unknown }
  } catch { return { tooLarge: false, value: null } }
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
