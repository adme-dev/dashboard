import type { H3Event } from 'h3'
import { kvGet, kvPut, kvDelete } from '~~/server/utils/kv'
import { queryOne } from '~~/server/utils/db'

export interface ResolvedQr { id: string, clientId: string, url: string, active: boolean }
const TTL = 86_400
const key = (code: string) => `qr:${code}`

export async function resolveQrCode(event: H3Event, code: string): Promise<ResolvedQr | null> {
  const cached = await kvGet<ResolvedQr>(event, key(code))
  if (cached) return cached
  const row = await queryOne<{ id: string, client_id: string, destination_url: string, is_active: boolean }>(
    `SELECT id, client_id, destination_url, is_active FROM qr_codes WHERE code = $1`, [code]
  )
  if (!row) return null
  const resolved: ResolvedQr = { id: row.id, clientId: row.client_id, url: row.destination_url, active: row.is_active }
  await kvPut(event, key(code), resolved, TTL)
  return resolved
}

export async function invalidateQrCache(event: H3Event, code: string): Promise<void> {
  await kvDelete(event, key(code))
}
