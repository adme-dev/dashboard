import { z } from 'zod'
import { ContentAttachmentCompletionSchema } from '../../../shared/pageStudio/content-attachment'
import { ContentAttachmentCompletionDenied, readContentAttachmentCompletion, type CompletionRead } from '../../../shared/pageStudio/contentAttachmentCompletionReader'

const Request = z.object({ expectedEnvironment: z.enum(['staging', 'production']), completion: ContentAttachmentCompletionSchema }).strict()
const rejected = (code: string, statusCode: number, message: string) => ({ ok: false as const, error: { code, statusCode, message } })

export async function handleContentAttachmentCompletion(input: unknown, environment: string, read: CompletionRead) {
  const parsed = Request.safeParse(input)
  if (!parsed.success) return rejected('CMS_COMPLETION_INVALID', 400, 'Invalid CMS completion request')
  if (!['staging', 'production'].includes(environment) || parsed.data.expectedEnvironment !== environment || parsed.data.completion.scope.environment !== environment) {
    return rejected('CMS_COMPLETION_UNAVAILABLE', 503, 'CMS completion authority is unavailable')
  }
  try {
    const value = await readContentAttachmentCompletion(parsed.data.completion, parsed.data.expectedEnvironment, read)
    return { ok: true as const, value }
  } catch (error) {
    if (error instanceof ContentAttachmentCompletionDenied) return rejected('CMS_COMPLETION_DENIED', 403, 'CMS completion could not be verified')
    return rejected('CMS_COMPLETION_UNAVAILABLE', 503, 'CMS completion authority is unavailable')
  }
}
