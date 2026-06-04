// server/api/email/templates/index.post.ts
import { z } from 'zod'
import { requireWriteAccess } from '~~/server/utils/auth'
import { createTemplate } from '~~/server/utils/email-marketing/templates'

const Body = z.object({
  name: z.string().min(1).max(200),
  subject: z.string().max(300).optional().nullable(),
  preview_text: z.string().max(300).optional().nullable(),
  body_source: z.any().optional(),
  template_kind: z.enum(['template', 'draft']).optional(),
  folder_name: z.string().max(120).optional().nullable(),
  client_id: z.string().uuid().optional().nullable()
})

export default defineEventHandler(async (event) => {
  const user = await requireWriteAccess(event)
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'invalid_body', data: parsed.error.issues })
  }
  const template = await createTemplate({ ...parsed.data, created_by: user.id })
  return { template }
})
