// server/api/email/campaigns/[id].patch.ts
import { z } from 'zod'
import { requireWriteAccess } from '~~/server/utils/auth'
import { assertEmailClientAccess } from '~~/server/utils/email-marketing/access'
import { getCampaign, scheduleCampaign, updateCampaign } from '~~/server/utils/email-marketing/campaigns'
import { isValidSegment } from '~~/server/utils/email-marketing/segment'
import { isEmailConfigured } from '~~/server/utils/email'

const Body = z.object({
  name: z.string().min(1).max(200).optional(),
  subject: z.string().max(300).optional().nullable(),
  from_name: z.string().max(200).optional().nullable(),
  from_email: z.string().email().max(300).optional().nullable(),
  reply_to: z.string().email().max(300).optional().nullable(),
  preview_text: z.string().max(300).optional().nullable(),
  body_source: z.any().optional(),
  template_id: z.string().uuid().optional().nullable(),
  scheduled_at: z.string().datetime().optional().nullable(),
  filter_rules: z.any().optional().nullable()
})

export default defineEventHandler(async (event) => {
  const user = await requireWriteAccess(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'missing_id' })
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'invalid_body', data: parsed.error.issues })
  }
  if (parsed.data.filter_rules != null && !isValidSegment(parsed.data.filter_rules)) {
    throw createError({ statusCode: 400, statusMessage: 'invalid_segment' })
  }
  const existing = await getCampaign(id)
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'not_found' })
  await assertEmailClientAccess(event, user, existing.client_id)
  const { scheduled_at: scheduledAt, ...draftPatch } = parsed.data
  if (scheduledAt) {
    if (Object.keys(draftPatch).length > 0) {
      const updated = await updateCampaign(id, draftPatch)
      if (!updated) throw createError({ statusCode: 404, statusMessage: 'not_found' })
    }
    const sendingConfigured = isEmailConfigured(event)
    const campaign = await scheduleCampaign(id, scheduledAt, {
      sendingConfigured,
      senderDomainAuthenticated: sendingConfigured
    })
    return { campaign }
  }

  const campaign = await updateCampaign(id, parsed.data)
  if (!campaign) throw createError({ statusCode: 404, statusMessage: 'not_found' })
  return { campaign }
})
