// server/api/email/campaigns/index.post.ts
import { z } from 'zod'
import { requireWriteAccess } from '~~/server/utils/auth'
import { createCampaign } from '~~/server/utils/email-marketing/campaigns'
import { isValidSegment } from '~~/server/utils/email-marketing/segment'

const Body = z.object({
  name: z.string().min(1).max(200),
  subject: z.string().max(300).optional().nullable(),
  from_name: z.string().max(200).optional().nullable(),
  from_email: z.string().email().max(300).optional().nullable(),
  reply_to: z.string().email().max(300).optional().nullable(),
  preview_text: z.string().max(300).optional().nullable(),
  body_source: z.any().optional(),
  template_id: z.string().uuid().optional().nullable(),
  client_id: z.string().uuid().optional().nullable(),
  filter_rules: z.any().optional().nullable()
})

export default defineEventHandler(async (event) => {
  const user = await requireWriteAccess(event)
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'invalid_body', data: parsed.error.issues })
  }
  if (parsed.data.filter_rules != null && !isValidSegment(parsed.data.filter_rules)) {
    throw createError({ statusCode: 400, statusMessage: 'invalid_segment' })
  }
  const campaign = await createCampaign({ ...parsed.data, created_by: user.id })
  return { campaign }
})
