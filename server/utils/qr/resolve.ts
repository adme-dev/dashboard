import type { H3Event } from 'h3'
import { kvGet, kvPut, kvDelete } from '~~/server/utils/kv'
import { queryOne } from '~~/server/utils/db'

export interface ResolvedQr {
  id: string
  clientId: string
  url: string
  active: boolean
  /** Tagging inputs for buildTrackedUrl. Absent on cache entries written before tagging shipped → treated as enabled. */
  code?: string
  utmEnabled?: boolean
  utmMedium?: string | null
  campaign?: string | null
}
const TTL = 86_400
const key = (code: string) => `qr:${code}`

export async function resolveQrCode(event: H3Event, code: string): Promise<ResolvedQr | null> {
  const cached = await kvGet<ResolvedQr>(event, key(code))
  if (cached) return cached
  const row = await queryOne<{ id: string, client_id: string, destination_url: string, is_active: boolean, utm_enabled: boolean, utm_medium: string | null, name: string, folder_name: string | null }>(
    `SELECT c.id, c.client_id, c.destination_url, c.is_active, c.utm_enabled, c.utm_medium, c.name, f.name AS folder_name
     FROM qr_codes c LEFT JOIN qr_folders f ON f.id = c.folder_id WHERE c.code = $1`, [code]
  )
  if (!row) return null
  const resolved: ResolvedQr = {
    id: row.id, clientId: row.client_id, url: row.destination_url, active: row.is_active,
    code, utmEnabled: row.utm_enabled, utmMedium: row.utm_medium, campaign: row.folder_name || row.name
  }
  await kvPut(event, key(code), resolved, TTL)
  return resolved
}

export async function invalidateQrCache(event: H3Event, code: string): Promise<void> {
  await kvDelete(event, key(code))
}
