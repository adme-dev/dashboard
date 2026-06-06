// server/api/email/campaigns/[id]/events.get.ts
import { requireAuth } from '~~/server/utils/auth'
import { queryOne, queryRows } from '~~/server/utils/db'
import { assertEmailClientAccess } from '~~/server/utils/email-marketing/access'
import { getCampaign } from '~~/server/utils/email-marketing/campaigns'

function toNumber(value: unknown): number {
  return Number(value ?? 0)
}

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'missing_id' })
  const campaign = await getCampaign(id)
  if (!campaign) throw createError({ statusCode: 404, statusMessage: 'not_found' })
  await assertEmailClientAccess(event, user, campaign.client_id)

  const summaryRow = await queryOne<{
    sent: number | string
    delivered: number | string
    opened: number | string
    clicked: number | string
    human_clicked: number | string
    delivery_delayed: number | string
    bounced: number | string
    complained: number | string
    unsubscribed: number | string
  }>(`
    SELECT
      COUNT(*) FILTER (WHERE event_type = 'sent')::int AS sent,
      COUNT(*) FILTER (WHERE event_type = 'delivered')::int AS delivered,
      COUNT(*) FILTER (WHERE event_type = 'opened')::int AS opened,
      COUNT(*) FILTER (WHERE event_type = 'clicked')::int AS clicked,
      COUNT(*) FILTER (
        WHERE event_type = 'clicked'
          AND raw->>'source' = 'first_party_redirect'
          AND COALESCE(raw #>> '{clickClassification,suspectedScanner}', 'true') = 'false'
      )::int AS human_clicked,
      COUNT(*) FILTER (WHERE event_type = 'delivery_delayed')::int AS delivery_delayed,
      COUNT(*) FILTER (WHERE event_type = 'bounced')::int AS bounced,
      COUNT(*) FILTER (WHERE event_type = 'complained')::int AS complained,
      COUNT(*) FILTER (WHERE event_type = 'unsubscribed')::int AS unsubscribed
    FROM email_events
    WHERE campaign_id = $1
  `, [id])

  const events = await queryRows(`
    SELECT
      ee.id,
      ee.campaign_id,
      ee.subscriber_id,
      s.email AS subscriber_email,
      s.name AS subscriber_name,
      ee.event_type,
      ee.url,
      ee.raw,
      COALESCE(raw #>> '{clickClassification,suspectedScanner}', 'false') = 'true' AS suspected_scanner,
      CASE WHEN ee.event_type = 'opened' THEN 'directional' ELSE NULL END AS metric_note,
      ee.occurred_at
    FROM email_events ee
    LEFT JOIN email_subscribers s ON s.id = ee.subscriber_id
    WHERE ee.campaign_id = $1
    ORDER BY ee.occurred_at DESC
    LIMIT 200
  `, [id])

  return {
    summary: {
      sent: toNumber(summaryRow?.sent),
      delivered: toNumber(summaryRow?.delivered),
      opened: toNumber(summaryRow?.opened),
      opened_label: 'directional',
      clicked: toNumber(summaryRow?.clicked),
      human_clicked: toNumber(summaryRow?.human_clicked),
      delivery_delayed: toNumber(summaryRow?.delivery_delayed),
      bounced: toNumber(summaryRow?.bounced),
      complained: toNumber(summaryRow?.complained),
      unsubscribed: toNumber(summaryRow?.unsubscribed)
    },
    events
  }
})
