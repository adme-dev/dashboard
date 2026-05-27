import { requireClientAuth } from '~~/server/utils/clientAuth'
import { queryRows } from '~~/server/utils/db'

const PORTAL_VISIBLE_EXISTS = `EXISTS (
  SELECT 1 FROM lead_form_rules r
  JOIN lead_rule_destinations d ON d.rule_id = r.id
  WHERE r.source = l.source AND r.form_id = l.form_id
    AND r.client_id = l.client_id
    AND r.enabled = TRUE
    AND d.destination_type = 'portal' AND d.enabled = TRUE
)`

const STATUSES = new Set(['new', 'contacted', 'qualified', 'won', 'lost', 'spam_suspected'])
const SOURCES = new Set(['meta', 'google', 'webhook', 'csv'])

function esc(v: unknown): string {
  if (v == null) return ''
  const s = typeof v === 'string' ? v : JSON.stringify(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export default defineEventHandler(async (event) => {
  const client = await requireClientAuth(event)
  const q = getQuery(event) as Record<string, string>
  const conds = [
    'l.client_id = $1',
    'l.deleted_at IS NULL',
    PORTAL_VISIBLE_EXISTS
  ]
  const params: unknown[] = [client.clientId]
  const status = String(q.status ?? '')
  const source = String(q.source ?? '')

  if (status && status !== 'all' && STATUSES.has(status)) {
    params.push(status)
    conds.push(`l.status = $${params.length}`)
  }
  if (source && source !== 'all' && SOURCES.has(source)) {
    params.push(source)
    conds.push(`l.source = $${params.length}`)
  }
  if (q.from) {
    params.push(q.from)
    conds.push(`l.submitted_at >= $${params.length}::date`)
  }
  if (q.to) {
    params.push(q.to)
    conds.push(`l.submitted_at < ($${params.length}::date + INTERVAL '1 day')`)
  }
  const campaignId = q.campaignId?.trim() || q.campaign_id?.trim()
  if (campaignId) {
    params.push(campaignId)
    conds.push(`l.campaign_id = $${params.length}`)
  }
  if (q.campaign?.trim()) {
    params.push(q.campaign.trim())
    conds.push(`l.campaign_name = $${params.length}`)
  }
  if (q.search?.trim()) {
    params.push(`%${q.search.trim()}%`)
    conds.push(`(
      l.form_name ILIKE $${params.length}
      OR l.campaign_name ILIKE $${params.length}
      OR l.ad_name ILIKE $${params.length}
      OR l.field_data::text ILIKE $${params.length}
    )`)
  }

  const rows = await queryRows<Record<string, unknown>>(
    `SELECT l.submitted_at, l.source, l.form_name, l.campaign_name, l.ad_name, l.status, l.field_data
     FROM leads l WHERE ${conds.join(' AND ')}
     ORDER BY l.submitted_at DESC LIMIT 5000`,
    params
  )
  const header = ['submitted_at', 'source', 'form_name', 'campaign_name', 'ad_name', 'status', 'field_data']
  const lines = [header.join(','), ...rows.map(r => header.map(h => esc(r[h])).join(','))]
  setResponseHeader(event, 'Content-Type', 'text/csv; charset=utf-8')
  setResponseHeader(event, 'Content-Disposition',
    `attachment; filename="my-leads-${new Date().toISOString().slice(0, 10)}.csv"`)
  return lines.join('\n')
})
