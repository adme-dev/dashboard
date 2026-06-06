// server/api/email/campaigns/[id]/attribution.get.ts
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

  const params: unknown[] = [id]
  const clientScope = campaign.client_id ? 'AND client_id = $2::uuid' : ''
  if (campaign.client_id) params.push(campaign.client_id)

  const tracking = await queryOne<{
    website_events: number | string
    sessions: number | string
    page_views: number | string
    conversions: number | string
    click_attributed_events: number | string
  }>(`
    SELECT
      COUNT(*)::int AS website_events,
      COUNT(DISTINCT session_id) FILTER (WHERE session_id IS NOT NULL)::int AS sessions,
      COUNT(*) FILTER (WHERE event_name = 'page_view')::int AS page_views,
      COUNT(*) FILTER (
        WHERE event_name IN ('form_submit', 'generate_lead', 'test_drive_booking')
      )::int AS conversions,
      COUNT(*) FILTER (WHERE event_data->>'email_click_id' IS NOT NULL)::int AS click_attributed_events
    FROM tracking_events
    WHERE utm_source = 'email'
      AND utm_medium = 'email'
      AND utm_campaign = $1
      ${clientScope}
      AND COALESCE(consent->>'tracking', 'denied') = 'granted'
  `, params)

  const leadSummary = await queryOne<{ leads: number | string }>(`
    SELECT COUNT(*)::int AS leads
    FROM leads
    WHERE attribution->>'utm_source' = 'email'
      AND attribution->>'utm_medium' = 'email'
      AND attribution->>'utm_campaign' = $1
      ${clientScope}
  `, params)

  const sessions = await queryRows(`
    SELECT
      session_id,
      anon_id,
      MIN(COALESCE(occurred_at, received_at)) AS first_seen_at,
      MAX(COALESCE(occurred_at, received_at)) AS last_seen_at,
      COUNT(*)::int AS events,
      COUNT(*) FILTER (
        WHERE event_name IN ('form_submit', 'generate_lead', 'test_drive_booking')
      )::int AS conversions,
      ARRAY_REMOVE(ARRAY_AGG(DISTINCT event_data->>'email_click_id'), NULL) AS email_click_ids
    FROM tracking_events
    WHERE utm_source = 'email'
      AND utm_medium = 'email'
      AND utm_campaign = $1
      ${clientScope}
      AND COALESCE(consent->>'tracking', 'denied') = 'granted'
    GROUP BY session_id, anon_id
    ORDER BY last_seen_at DESC
    LIMIT 100
  `, params)

  return {
    summary: {
      website_events: toNumber(tracking?.website_events),
      sessions: toNumber(tracking?.sessions),
      page_views: toNumber(tracking?.page_views),
      conversions: toNumber(tracking?.conversions),
      click_attributed_events: toNumber(tracking?.click_attributed_events),
      leads: toNumber(leadSummary?.leads)
    },
    sessions
  }
})
