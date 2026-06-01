// server/api/email/templates/render.post.ts
// Stateless render of a flyhub document to email HTML — used by the editor's
// live preview (Phase 2a-ii) and for test sends. Does not persist anything.

import { z } from 'zod'
import { requireAuth } from '~~/server/utils/auth'
import { renderTemplateDocument } from '~~/server/utils/email-marketing/render'
import { isFlyhubFormat } from '~~/server/utils/email-marketing/render/flyhub-html-renderer'

const Body = z.object({
  body_source: z.any(),
  subject: z.string().optional().nullable(),
  preview_text: z.string().optional().nullable(),
  variables: z.record(z.string(), z.string()).optional()
})

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'invalid_body', data: parsed.error.issues })
  }
  if (!isFlyhubFormat(parsed.data.body_source)) {
    throw createError({ statusCode: 400, statusMessage: 'invalid_flyhub_document' })
  }
  const html = renderTemplateDocument(parsed.data.body_source, {
    subjectLine: parsed.data.subject ?? undefined,
    previewText: parsed.data.preview_text ?? undefined,
    variables: parsed.data.variables
  })
  return { html }
})
