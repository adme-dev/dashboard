// server/api/email/campaigns/[id]/test-send.post.ts
// Send a single test email of the campaign to the current user (or a provided
// address). Gated by the same hard send gate. Does not touch campaign state.
import { z } from 'zod'
import { requireWriteAccess } from '~~/server/utils/auth'
import { assertEmailClientAccess } from '~~/server/utils/email-marketing/access'
import { getCampaign } from '~~/server/utils/email-marketing/campaigns'
import { isCampaignSendingEnabled } from '~~/server/utils/email-marketing/campaignSender'
import { getResendClient } from '~~/server/utils/email'
import { sendCampaignTestEmail } from '~~/server/utils/email-marketing/campaignTestSend'

const OptionalTestRecipient = z.preprocess((value) => {
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  return trimmed || null
}, z.string().email().optional().nullable())

const Body = z.object({ to: OptionalTestRecipient })

export default defineEventHandler(async (event) => {
  const user = await requireWriteAccess(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'missing_id' })

  if (!isCampaignSendingEnabled(event)) {
    throw createError({ statusCode: 403, statusMessage: 'sending_disabled' })
  }
  if (!getResendClient(event)) throw createError({ statusCode: 503, statusMessage: 'resend_unavailable' })

  const parsed = Body.safeParse(await readBody(event).catch(() => ({})))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'invalid_body', data: parsed.error.issues })
  }
  const to = parsed.data.to || (user as { email?: string }).email
  if (!to) throw createError({ statusCode: 422, statusMessage: 'no_test_recipient' })

  const campaign = await getCampaign(id)
  if (!campaign) throw createError({ statusCode: 404, statusMessage: 'not_found' })
  await assertEmailClientAccess(event, user, campaign.client_id)
  if (!campaign.from_email) throw createError({ statusCode: 422, statusMessage: 'missing_from_email' })

  const testUser = user as { id?: string, email?: string, name?: string }
  const { sentTo } = await sendCampaignTestEmail(event, {
    campaign,
    to,
    name: testUser.name ?? null,
    userId: String(testUser.id || testUser.email || id)
  })
  return { sent_to: sentTo }
})
