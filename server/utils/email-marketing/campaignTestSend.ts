// server/utils/email-marketing/campaignTestSend.ts
// Single test email of a campaign, shared by the browser test-send route and the marketing
// department MCP. Callers own authorization, the hard send gate and the recipient choice; this
// prepares the sendable HTML, re-runs preflight for one recipient and makes the one Resend call.
// Never touches campaign state or recipient queues.
import { createError, type H3Event } from 'h3'
import { getAppUrl } from '~~/server/utils/appUrl'
import { getResendClient, isEmailConfigured } from '~~/server/utils/email'
import { prepareCampaignHtmlForSend, type Campaign } from './campaigns'
import { buildBatchEmail, buildCampaignPreflight } from './campaignSend'
import { resolveCampaignSenderDomains } from './senderIdentity'
import { emailLinkSecret, signEmailToken } from './links'

export interface CampaignTestSendInput {
  campaign: Campaign
  to: string
  name?: string | null
  /** Asset-mirroring owner for prepareCampaignHtmlForSend. */
  userId: string
  /** Called immediately before the provider request; after it, failures are not provably effect-free. */
  onDispatchStart?: () => void
}

export async function sendCampaignTestEmail(event: H3Event, input: CampaignTestSendInput): Promise<{ sentTo: string, providerMessageId: string | null }> {
  const client = getResendClient(event)
  if (!client) throw createError({ statusCode: 503, statusMessage: 'resend_unavailable' })
  const { campaign } = input
  if (!campaign.from_email) throw createError({ statusCode: 422, statusMessage: 'missing_from_email' })

  const appUrl = getAppUrl(event)
  const preparedCampaign = await prepareCampaignHtmlForSend(campaign, { appUrl, userId: input.userId })
  const sendingConfigured = isEmailConfigured(event)
  const preflight = buildCampaignPreflight({
    campaign: preparedCampaign,
    toSend: 1,
    sendingConfigured,
    senderDomainAuthenticated: sendingConfigured,
    allowedSenderDomains: resolveCampaignSenderDomains(event)
  })
  if (preflight.blocked) {
    throw createError({
      statusCode: 422,
      statusMessage: 'campaign_preflight_blocked',
      data: { preflight }
    })
  }

  const email = buildBatchEmail(
    preparedCampaign,
    { email: input.to, name: input.name ?? null, subscriber_id: 'test' },
    campaign.id,
    appUrl,
    await signEmailToken(emailLinkSecret(), 'unsub', campaign.id, 'test')
  )
  input.onDispatchStart?.()
  const { data, error } = await client.emails.send({
    from: email.from,
    to: email.to,
    subject: `[TEST] ${email.subject}`,
    html: email.html,
    headers: email.headers,
    ...(email.replyTo ? { replyTo: email.replyTo } : {})
  })
  if (error) throw createError({ statusCode: 502, statusMessage: 'test_send_failed', message: error.message })
  return { sentTo: input.to, providerMessageId: (data as { id?: string } | null)?.id ?? null }
}
