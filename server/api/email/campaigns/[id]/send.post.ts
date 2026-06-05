// server/api/email/campaigns/[id]/send.post.ts
// Trigger a campaign send. Doubly gated: (1) the hard send gate
// (isCampaignSendingEnabled) must be ON, and (2) canEnterSending must pass
// (recipients materialized + unsubscribe link present). Sends in a capped,
// paced loop; large campaigns continue on subsequent calls (2b-2b: queue/cron).
import { requireWriteAccess } from '~~/server/utils/auth'
import { assertEmailClientAccess } from '~~/server/utils/email-marketing/access'
import { getCampaign, prepareCampaignHtmlForSend, setCampaignStatus } from '~~/server/utils/email-marketing/campaigns'
import { buildCampaignPreflight, canEnterSending } from '~~/server/utils/email-marketing/campaignSend'
import { isCampaignSendingEnabled, runCampaignSend } from '~~/server/utils/email-marketing/campaignSender'
import { isEmailConfigured } from '~~/server/utils/email'
import { getAppUrl } from '~~/server/utils/appUrl'

function emailSendUserId(user: unknown): string {
  const value = user as { id?: string, email?: string }
  return String(value.id || value.email || 'campaign-send')
}

export default defineEventHandler(async (event) => {
  const user = await requireWriteAccess(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'missing_id' })

  if (!isCampaignSendingEnabled()) {
    throw createError({
      statusCode: 403,
      statusMessage: 'sending_disabled',
      message: 'Email sending is disabled. Set EMAIL_SENDING_ENABLED=true (and configure Resend) to enable.'
    })
  }

  let campaign = await getCampaign(id)
  if (!campaign) throw createError({ statusCode: 404, statusMessage: 'not_found' })
  await assertEmailClientAccess(event, user, campaign.client_id)
  if (!campaign.from_email) {
    throw createError({ statusCode: 422, statusMessage: 'missing_from_email' })
  }
  campaign = await prepareCampaignHtmlForSend(campaign, {
    appUrl: getAppUrl(event),
    userId: emailSendUserId(user)
  })

  const sendingConfigured = isEmailConfigured(event)
  const preflight = buildCampaignPreflight({
    campaign,
    toSend: campaign.to_send,
    sendingConfigured,
    senderDomainAuthenticated: sendingConfigured
  })
  if (preflight.blocked) {
    throw createError({
      statusCode: 422,
      statusMessage: 'campaign_preflight_blocked',
      data: { preflight }
    })
  }

  const gate = canEnterSending({
    status: campaign.status,
    toSend: campaign.to_send,
    bodyHtml: campaign.body_html
  })
  if (!gate.ok) throw createError({ statusCode: 422, statusMessage: gate.reason })

  // Move to sending (also marks started_at on first entry) before draining.
  if (campaign.status !== 'sending') {
    await setCampaignStatus(id, 'sending')
  }
  const result = await runCampaignSend(
    { ...campaign, status: 'sending' },
    { prepareHtml: false }
  )

  if (result.drained) await setCampaignStatus(id, 'sent')
  return { ...result, status: result.drained ? 'sent' : 'sending' }
})
