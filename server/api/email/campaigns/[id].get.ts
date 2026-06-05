// server/api/email/campaigns/[id].get.ts
import { requireAuth } from '~~/server/utils/auth'
import { assertEmailClientAccess } from '~~/server/utils/email-marketing/access'
import { getCampaign, getCampaignListIds } from '~~/server/utils/email-marketing/campaigns'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'missing_id' })
  const campaign = await getCampaign(id)
  if (!campaign) throw createError({ statusCode: 404, statusMessage: 'not_found' })
  await assertEmailClientAccess(event, user, campaign.client_id)
  const list_ids = await getCampaignListIds(id)
  return { campaign, list_ids }
})
