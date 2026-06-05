// server/api/email/campaigns/[id]/cancel.post.ts
// Cancel a campaign: status → cancelled and remaining pending recipients →
// cancelled (already-sent recipients are untouched).
import { requireWriteAccess } from '~~/server/utils/auth'
import { assertEmailClientAccess } from '~~/server/utils/email-marketing/access'
import { getCampaign, setCampaignStatus, cancelPendingRecipients } from '~~/server/utils/email-marketing/campaigns'

export default defineEventHandler(async (event) => {
  const user = await requireWriteAccess(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'missing_id' })
  const campaign = await getCampaign(id)
  if (!campaign) throw createError({ statusCode: 404, statusMessage: 'not_found' })
  await assertEmailClientAccess(event, user, campaign.client_id)
  await setCampaignStatus(id, 'cancelled')
  const cancelled = await cancelPendingRecipients(id)
  return { status: 'cancelled', cancelled }
})
