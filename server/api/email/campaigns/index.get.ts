// server/api/email/campaigns/index.get.ts
import { requireAuth } from '~~/server/utils/auth'
import { listCampaigns } from '~~/server/utils/email-marketing/campaigns'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const campaigns = await listCampaigns()
  return { campaigns }
})
