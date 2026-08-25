import type { H3Event } from 'h3'
import { createError } from 'h3'
import { queryOne, queryRows } from '~~/server/utils/db'
import { requireAuth, requireRole } from '~~/server/utils/auth'
import { ANALYTICS_ROLES, accessibleClientIds, isUuid } from '~~/server/utils/client-access'
import { shortUrl } from '~~/server/utils/qr/access'

export interface QrCampaignRow { id: string, client_id: string, name: string, created_by: string | null, created_at: string, updated_at: string }

/** Loads a campaign the caller may see (same client scoping as the QR list). */
export async function requireCampaignAccess(event: H3Event, id: string | undefined) {
  const user = await requireAuth(event)
  await requireRole(event, ANALYTICS_ROLES)
  if (!isUuid(id)) throw createError({ statusCode: 404, statusMessage: 'Campaign not found' })
  const row = await queryOne<QrCampaignRow>(`SELECT * FROM qr_campaigns WHERE id = $1`, [id])
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Campaign not found' })
  const scope = await accessibleClientIds(user)
  if (scope && !scope.includes(row.client_id)) throw createError({ statusCode: 404, statusMessage: 'Campaign not found' })
  return { user, row }
}

/** Per-code roll-up: scans, unique-ish visitors, leads (xf_qr click id or utm_content = code). */
export async function campaignCodeRollup(campaignId: string) {
  const rows = await queryRows<any>(
    `SELECT c.id, c.code, c.name, c.destination_url, c.destination_mode, c.style, c.frame, c.is_active, c.scan_count, c.last_scanned_at, c.created_at,
       (SELECT COUNT(DISTINCT s.ip_hash)::int FROM qr_scans s WHERE s.qr_code_id = c.id) AS visitors,
       (SELECT COUNT(*)::int FROM leads l WHERE l.deleted_at IS NULL AND l.client_id = c.client_id
          AND (l.attribution->>'xf_qr' = c.code OR l.attribution->>'utm_content' = c.code)) AS leads
     FROM qr_codes c WHERE c.campaign_id = $1 ORDER BY c.name ASC`, [campaignId])
  return rows.map(r => ({ ...r, short_url: shortUrl(r.code) }))
}
