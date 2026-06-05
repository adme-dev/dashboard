// server/api/email/templates/[id].patch.ts
import { z } from 'zod'
import { requireWriteAccess } from '~~/server/utils/auth'
import { getTemplate, updateTemplate } from '~~/server/utils/email-marketing/templates'
import { assertEmailClientAccess } from '~~/server/utils/email-marketing/access'

const Body = z.object({
  name: z.string().min(1).max(200).optional(),
  subject: z.string().max(300).optional().nullable(),
  preview_text: z.string().max(300).optional().nullable(),
  body_source: z.any().optional(),
  template_kind: z.enum(['template', 'draft']).optional(),
  folder_name: z.string().max(120).optional().nullable()
})

export default defineEventHandler(async (event) => {
  const user = await requireWriteAccess(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'missing_id' })
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'invalid_body', data: parsed.error.issues })
  }
  const existing = await getTemplate(id)
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'not_found' })
  await assertEmailClientAccess(event, user, existing.client_id)
  const template = await updateTemplate(id, parsed.data)
  if (!template) throw createError({ statusCode: 404, statusMessage: 'not_found' })
  return { template }
})
