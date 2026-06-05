// server/api/email/campaigns/[id]/materialize.post.ts
// Build (or refresh) the campaign's recipient work queue from its target lists.
// Does NOT send anything — just computes who would be emailed and sets to_send.
import { requireWriteAccess } from '~~/server/utils/auth'
import { assertEmailClientAccess } from '~~/server/utils/email-marketing/access'
import { getCampaign, materializeRecipients } from '~~/server/utils/email-marketing/campaigns'
import { getAppUrl } from '~~/server/utils/appUrl'

function emailSendUserId(user: unknown): string {
  const value = user as { id?: string, email?: string }
  return String(value.id || value.email || 'campaign-materialize')
}

export default defineEventHandler(async (event) => {
  const user = await requireWriteAccess(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'missing_id' })
  const campaign = await getCampaign(id)
  if (!campaign) throw createError({ statusCode: 404, statusMessage: 'not_found' })
  await assertEmailClientAccess(event, user, campaign.client_id)
  const to_send = await materializeRecipients(id, {
    appUrl: getAppUrl(event),
    userId: emailSendUserId(user)
  })
  return { to_send }
})
