// server/api/agency/email/modules/index.post.ts
import { z } from 'zod'
import { requireWriteAccess } from '~~/server/utils/auth'
import {
  createCustomModule,
  validateModuleFragment,
  PreviewToneSchema
} from '~~/server/utils/email-marketing/customModules'

const Body = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(500).optional().nullable(),
  category: z.string().min(1).max(80).optional().nullable(),
  preview_tone: PreviewToneSchema.optional().nullable(),
  blocks: z.unknown(),
  client_id: z.string().uuid().optional().nullable()
})

export default defineEventHandler(async (event) => {
  const user = await requireWriteAccess(event)
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'invalid_body', data: parsed.error.issues })
  }

  let fragment
  try {
    fragment = validateModuleFragment(parsed.data.blocks)
  } catch (err) {
    throw createError({
      statusCode: 400,
      statusMessage: 'invalid_module_fragment',
      data: err instanceof z.ZodError ? err.issues : String(err)
    })
  }

  const module = await createCustomModule({
    name: parsed.data.name,
    description: parsed.data.description ?? null,
    category: parsed.data.category ?? 'custom',
    preview_tone: parsed.data.preview_tone ?? 'light',
    blocks: fragment,
    client_id: parsed.data.client_id ?? null,
    created_by: user.id
  })
  return { module }
})
