// server/api/email/campaigns/[id].patch.ts
import { z } from 'zod'
import { requireWriteAccess } from '~~/server/utils/auth'
import { updateCampaign } from '~~/server/utils/email-marketing/campaigns'

const Body = z.object({
  name: z.string().min(1).max(200).optional(),
  subject: z.string().max(300).optional().nullable(),
  from_name: z.string().max(200).optional().nullable(),
  from_email: z.string().email().max(300).optional().nullable(),
  reply_to: z.string().email().max(300).optional().nullable(),
  preview_text: z.string().max(300).optional().nullable(),
  body_source: z.any().optional(),
  template_id: z.string().uuid().optional().nullable(),
  scheduled_at: z.string().datetime().optional().nullable()
})

export default defineEventHandler(async (event) => {
  await requireWriteAccess(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'missing_id' })
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'invalid_body', data: parsed.error.issues })
  }
  const campaign = await updateCampaign(id, parsed.data)
  if (!campaign) throw createError({ statusCode: 404, statusMessage: 'not_found' })
  return { campaign }
})
