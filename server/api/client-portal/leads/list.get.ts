// server/api/client-portal/leads/list.get.ts
// Client portal: filtered to client + portal-visible only.
// Visibility rule: client portal sees a lead iff at least one of the form's
// destinations is type='portal' AND enabled.

import { requireClientAuth } from '~~/server/utils/clientAuth'
import { queryRows, queryCount } from '~~/server/utils/db'
import { safeEmailLeadPresentationSelect } from '~~/server/utils/leads/leadPresentation'

const PORTAL_VISIBLE_EXISTS = `EXISTS (
  SELECT 1 FROM lead_form_rules r
  JOIN lead_rule_destinations d ON d.rule_id = r.id
  WHERE r.source = l.source AND r.form_id = l.form_id
    AND r.client_id = l.client_id
    AND r.enabled = TRUE
    AND d.destination_type = 'portal' AND d.enabled = TRUE
)`

const STATUSES = new Set(['new', 'contacted', 'qualified', 'won', 'lost', 'spam_suspected'])
const SOURCES = new Set(['meta', 'google', 'webhook', 'csv', 'email'])

const DUPLICATE_PORTAL_VISIBLE = `EXISTS (
  SELECT 1 FROM lead_form_rules duplicate_rule
  JOIN lead_rule_destinations duplicate_destination ON duplicate_destination.rule_id = duplicate_rule.id
  WHERE duplicate_rule.source = duplicate_lead.source
    AND duplicate_rule.form_id = duplicate_lead.form_id
    AND duplicate_rule.client_id = duplicate_lead.client_id
    AND duplicate_rule.enabled = TRUE
    AND duplicate_destination.destination_type = 'portal'
    AND duplicate_destination.enabled = TRUE
)`

export default defineEventHandler(async (event) => {
  const client = await requireClientAuth(event)
  const q = getQuery(event) as Record<string, string>
  const baseConds = [
    'l.deleted_at IS NULL',
    'l.client_id = $1',
    PORTAL_VISIBLE_EXISTS
  ]
  const baseParams: unknown[] = [client.clientId]
  const status = String(q.status ?? '')
  const source = String(q.source ?? '')

  if (source && source !== 'all' && SOURCES.has(source)) {
    baseParams.push(source)
    baseConds.push(`l.source = $${baseParams.length}`)
  }
  if (q.from) {
    baseParams.push(q.from)
    baseConds.push(`l.submitted_at >= $${baseParams.length}::date`)
  }
  if (q.to) {
    baseParams.push(q.to)
    baseConds.push(`l.submitted_at < ($${baseParams.length}::date + INTERVAL '1 day')`)
  }
  const campaignId = q.campaignId?.trim() || q.campaign_id?.trim()
  if (campaignId) {
    baseParams.push(campaignId)
    baseConds.push(`l.campaign_id = $${baseParams.length}`)
  }
  if (q.campaign?.trim()) {
    baseParams.push(q.campaign.trim())
    baseConds.push(`l.campaign_name = $${baseParams.length}`)
  }
  if (q.search?.trim()) {
    baseParams.push(`%${q.search.trim()}%`)
    baseConds.push(`(
      l.form_name ILIKE $${baseParams.length}
      OR l.campaign_name ILIKE $${baseParams.length}
      OR l.ad_name ILIKE $${baseParams.length}
      OR l.field_data::text ILIKE $${baseParams.length}
    )`)
  }

  const conds = [...baseConds]
  const params = [...baseParams]
  if (status && status !== 'all' && STATUSES.has(status)) {
    params.push(status)
    conds.push(`l.status = $${params.length}`)
  }

  const page = Math.max(1, parseInt(q.page ?? '1'))
  const ps = Math.min(200, Math.max(1, parseInt(q.page_size ?? '50')))
  const offset = (page - 1) * ps
  const items = await queryRows(
    `SELECT l.id, l.source, l.form_name, l.submitted_at, l.field_data,
            l.status, l.contacted_at, l.campaign_name, l.ad_name,
            ${safeEmailLeadPresentationSelect('l', DUPLICATE_PORTAL_VISIBLE)}
     FROM leads l WHERE ${conds.join(' AND ')}
     ORDER BY l.submitted_at DESC
     LIMIT ${ps} OFFSET ${offset}`,
    params
  )
  const total = await queryCount(
    `SELECT COUNT(*)::text AS count FROM leads l WHERE ${conds.join(' AND ')}`,
    params
  )
  const stats = await queryRows<{ status: string, count: string }>(
    `SELECT l.status, COUNT(*)::text AS count
     FROM leads l
     WHERE ${baseConds.join(' AND ')}
     GROUP BY l.status`,
    baseParams
  )
  const sourceStats = await queryRows<{ source: string, count: string }>(
    `SELECT l.source, COUNT(*)::text AS count
     FROM leads l
     WHERE ${baseConds.join(' AND ')}
     GROUP BY l.source
     ORDER BY count DESC`,
    baseParams
  )
  const responseSummary = await queryRows<{
    total: string
    contacted: string
    qualified: string
    won: string
    avg_response_minutes: string | null
  }>(
    `SELECT
       COUNT(*)::text AS total,
       COUNT(*) FILTER (WHERE l.contacted_at IS NOT NULL)::text AS contacted,
       COUNT(*) FILTER (WHERE l.status = 'qualified')::text AS qualified,
       COUNT(*) FILTER (WHERE l.status = 'won')::text AS won,
       AVG(EXTRACT(EPOCH FROM (l.contacted_at - l.submitted_at)) / 60)
         FILTER (WHERE l.contacted_at IS NOT NULL) AS avg_response_minutes
     FROM leads l
     WHERE ${baseConds.join(' AND ')}`,
    baseParams
  )

  return { items, total, page, page_size: ps, stats, sourceStats, responseSummary: responseSummary[0] || null }
})
