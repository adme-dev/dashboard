// server/api/email/campaigns/index.get.ts
import { requireAuth } from '~~/server/utils/auth'
import { resolveEmailClientScope } from '~~/server/utils/email-marketing/access'
import { listCampaigns } from '~~/server/utils/email-marketing/campaigns'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const clientIds = await resolveEmailClientScope(event, user)
  const campaigns = await listCampaigns(clientIds)
  return { campaigns }
})
