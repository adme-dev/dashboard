import { randomUUID } from 'uncrypto'
import { emailLinkSecret } from '~~/server/utils/email-marketing/links'
import { appendEmailUtm, storedEmailUtmSettings, verifyEmailClickToken } from '~~/server/utils/email-marketing/trackingLinks'
import { classifyEmailClick } from '~~/server/utils/email-marketing/clickClassifier'
import { execute, queryOne } from '~~/server/utils/db'

function one(value: unknown): string | null {
  if (Array.isArray(value)) return typeof value[0] === 'string' ? value[0] : null
  return typeof value === 'string' ? value : null
}

function requestHeader(event: unknown, name: string): string | null {
  const headers = (event as { node?: { req?: { headers?: Record<string, string | string[] | undefined> } } })
    ?.node?.req?.headers
  const value = headers?.[name.toLowerCase()]
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const campaignId = one(query.c)
  const subscriberId = one(query.s)
  const destinationUrl = one(query.u)
  const token = one(query.t)
  if (!campaignId || !subscriberId || !destinationUrl) {
    throw createError({ statusCode: 400, statusMessage: 'invalid_click_link' })
  }

  let destination: string
  try {
    const parsed = new URL(destinationUrl)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      throw new Error('unsupported_protocol')
    }
    destination = parsed.toString()
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'invalid_click_destination' })
  }

  const valid = await verifyEmailClickToken({
    campaignId,
    subscriberId,
    destinationUrl,
    token,
    secret: emailLinkSecret()
  })
  if (!valid) {
    throw createError({ statusCode: 400, statusMessage: 'invalid_click_token' })
  }

  const clickId = randomUUID()
  const userAgent = requestHeader(event, 'user-agent')
  const clickedAt = new Date().toISOString()
  // utm_settings is read from the campaign row, which is immutable once it has
  // left draft; to_jsonb keeps this query valid before migration 497 is applied.
  const recipientSend = await queryOne<{ sent_at: string | null, utm_settings?: unknown }>(`
    SELECT
      (SELECT cr.sent_at::text FROM campaign_recipients cr
        WHERE cr.campaign_id = $1::uuid AND cr.subscriber_id = $2::uuid LIMIT 1) AS sent_at,
      (SELECT to_jsonb(c) -> 'utm_settings' FROM campaigns c WHERE c.id = $1::uuid LIMIT 1) AS utm_settings
  `, [campaignId, subscriberId])
  const attributedUrl = appendEmailUtm(destination, campaignId, clickId, storedEmailUtmSettings(recipientSend?.utm_settings))
  const classification = classifyEmailClick({
    userAgent,
    sentAt: recipientSend?.sent_at ?? null,
    clickedAt
  })
  const metadata = {
    source: 'first_party_redirect',
    userAgent,
    ipAddress: requestHeader(event, 'cf-connecting-ip') ?? requestHeader(event, 'x-forwarded-for'),
    sentAt: recipientSend?.sent_at ?? null,
    clickedAt,
    emailClickId: clickId,
    clickClassification: classification
  }

  await execute(`
    INSERT INTO email_events (id, campaign_id, subscriber_id, event_type, url, raw)
    VALUES ($1, $2, $3, 'clicked', $4, $5::jsonb)
  `, [clickId, campaignId, subscriberId, attributedUrl, JSON.stringify(metadata)])

  return sendRedirect(event, attributedUrl, 302)
})
