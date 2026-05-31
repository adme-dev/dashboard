// server/api/email/campaigns/[id]/test-send.post.ts
// Send a single test email of the campaign to the current user (or a provided
// address). Gated by the same hard send gate. Does not touch campaign state.
import { z } from 'zod'
import { requireWriteAccess } from '~~/server/utils/auth'
import { getCampaign } from '~~/server/utils/email-marketing/campaigns'
import { buildBatchEmail } from '~~/server/utils/email-marketing/campaignSend'
import { isCampaignSendingEnabled } from '~~/server/utils/email-marketing/campaignSender'
import { getResendClient, getAppUrl } from '~~/server/utils/email'

const Body = z.object({ to: z.string().email().optional() })

export default defineEventHandler(async (event) => {
  const user = await requireWriteAccess(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'missing_id' })

  if (!isCampaignSendingEnabled()) {
    throw createError({ statusCode: 403, statusMessage: 'sending_disabled' })
  }
  const client = getResendClient(event)
  if (!client) throw createError({ statusCode: 503, statusMessage: 'resend_unavailable' })

  const parsed = Body.safeParse(await readBody(event).catch(() => ({})))
  const to = parsed.success && parsed.data.to ? parsed.data.to : (user as { email?: string }).email
  if (!to) throw createError({ statusCode: 422, statusMessage: 'no_test_recipient' })

  const campaign = await getCampaign(id)
  if (!campaign) throw createError({ statusCode: 404, statusMessage: 'not_found' })
  if (!campaign.from_email) throw createError({ statusCode: 422, statusMessage: 'missing_from_email' })

  const email = buildBatchEmail(
    campaign,
    { email: to, name: (user as { name?: string }).name ?? null, subscriber_id: 'test' },
    id,
    getAppUrl(event)
  )
  const { error } = await client.emails.send({
    from: email.from,
    to: email.to,
    subject: `[TEST] ${email.subject}`,
    html: email.html,
    headers: email.headers,
    ...(email.replyTo ? { replyTo: email.replyTo } : {})
  })
  if (error) throw createError({ statusCode: 502, statusMessage: 'test_send_failed', message: error.message })
  return { sent_to: to }
})
