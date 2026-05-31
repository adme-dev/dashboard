// server/api/email/campaigns/[id]/cancel.post.ts
// Cancel a campaign: status → cancelled and remaining pending recipients →
// cancelled (already-sent recipients are untouched).
import { requireWriteAccess } from '~~/server/utils/auth'
import { setCampaignStatus, cancelPendingRecipients } from '~~/server/utils/email-marketing/campaigns'

export default defineEventHandler(async (event) => {
  await requireWriteAccess(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'missing_id' })
  await setCampaignStatus(id, 'cancelled')
  const cancelled = await cancelPendingRecipients(id)
  return { status: 'cancelled', cancelled }
})
