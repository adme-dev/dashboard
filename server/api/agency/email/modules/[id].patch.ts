// server/api/agency/email/modules/[id].patch.ts
import { z } from 'zod'
import { requireWriteAccess } from '~~/server/utils/auth'
import { getCustomModule, updateCustomModule, PreviewToneSchema } from '~~/server/utils/email-marketing/customModules'
import { assertEmailClientAccess } from '~~/server/utils/email-marketing/access'

const Body = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(500).optional().nullable(),
  category: z.string().min(1).max(80).optional(),
  preview_tone: PreviewToneSchema.optional()
})

export default defineEventHandler(async (event) => {
  const user = await requireWriteAccess(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'missing_id' })

  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'invalid_body', data: parsed.error.issues })
  }

  const existing = await getCustomModule(id)
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'not_found' })
  await assertEmailClientAccess(event, user, existing.client_id)
  const module = await updateCustomModule(id, parsed.data)
  if (!module) throw createError({ statusCode: 404, statusMessage: 'not_found' })
  return { module }
})
