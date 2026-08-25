import type { H3Event } from 'h3'
import { randomUUID } from 'node:crypto'
import { execute, queryOne } from '~~/server/utils/db'
import { buildQr360Row, type Qr360EventName } from '~~/shared/qr/export360'

const INSERT_SQL = `
  INSERT INTO tracking_events (
    site_id, client_id, event_id, anon_id, session_id, event_name, page_url, referrer,
    utm_source, utm_medium, utm_campaign, utm_term, utm_content,
    gclid, gbraid, wbraid, fbclid, fbc, fbp, ttclid, msclkid, li_fat_id, ga_client_id,
    event_data, consent, ua, ip_hash, origin, occurred_at
  ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29)
  ON CONFLICT (site_id, event_id) DO NOTHING`

/** Per-isolate cache of the client toggle + tracking site; scans must not pay a lookup every time. */
const cache = new Map<string, { until: number, siteId: string | null }>()
const CACHE_MS = 5 * 60_000
export const QR_360_TIMEOUT_MS = 700

export function resetQr360Cache() {
  cache.clear()
}

/** Tracking site id when the client has export_360 on and an active tracking site; else null. */
export async function qr360SiteFor(clientId: string): Promise<string | null> {
  const hit = cache.get(clientId)
  if (hit && hit.until > Date.now()) return hit.siteId
  const row = await queryOne<{ site_id: string | null }>(
    `SELECT (SELECT t.id FROM tracking_sites t WHERE t.client_id = s.client_id AND t.is_active = TRUE ORDER BY t.created_at ASC LIMIT 1) AS site_id
     FROM qr_client_settings s WHERE s.client_id = $1 AND s.export_360 = TRUE`, [clientId])
  const siteId = row?.site_id ?? null
  cache.set(clientId, { until: Date.now() + CACHE_MS, siteId })
  return siteId
}

export interface EmitQr360Input {
  clientId: string
  eventName: Qr360EventName
  code: string
  variant?: 'A' | 'B' | null
  ipHash: string | null
  ua?: string | null
  pageUrl?: string | null
  referrer?: string | null
  utm?: { source?: string | null, medium?: string | null, campaign?: string | null, content?: string | null }
  gaClientId?: string | null
  consent?: { tracking?: string, marketing?: string } | null
  leadId?: string | null
}

/**
 * Best-effort, time-capped mirror of a QR touchpoint into tracking_events. Never throws and never
 * delays a redirect beyond QR_360_TIMEOUT_MS — analytics can't be allowed to break a scan.
 */
export async function emitQr360Event(_event: H3Event | null, input: EmitQr360Input): Promise<'written' | 'skipped' | 'timeout' | 'failed'> {
  try {
    const siteId = await qr360SiteFor(input.clientId)
    if (!siteId) return 'skipped'
    const row = buildQr360Row({ ...input, siteId, eventId: randomUUID(), occurredAt: new Date().toISOString() })
    const params = [
      row.site_id, row.client_id, row.event_id, row.anon_id, row.session_id, row.event_name, row.page_url, row.referrer,
      row.utm_source, row.utm_medium, row.utm_campaign, row.utm_term, row.utm_content,
      row.gclid, row.gbraid, row.wbraid, row.fbclid, row.fbc, row.fbp, row.ttclid, row.msclkid, row.li_fat_id, row.ga_client_id,
      JSON.stringify(row.event_data), row.consent ? JSON.stringify(row.consent) : null, row.ua, row.ip_hash, row.origin, row.occurred_at
    ]
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<'timeout'>((resolve) => {
      timer = setTimeout(() => resolve('timeout'), QR_360_TIMEOUT_MS)
    })
    const write = execute(INSERT_SQL, params).then(() => 'written' as const)
    const result = await Promise.race([write, timeout])
    clearTimeout(timer)
    if (result === 'timeout') write.catch(err => console.error('[qr:360] late failure', err))
    return result
  } catch (err) {
    console.error('[qr:360]', err)
    return 'failed'
  }
}
