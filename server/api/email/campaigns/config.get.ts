// server/api/email/campaigns/config.get.ts
// Lets the UI reflect whether real sending is enabled (the hard gate) so Send
// can be disabled with a clear reason instead of failing on click.
import { requireAuth } from '~~/server/utils/auth'
import { isCampaignSendingEnabled } from '~~/server/utils/email-marketing/campaignSender'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  return { sending_enabled: isCampaignSendingEnabled() }
})
