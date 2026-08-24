import type { H3Event } from 'h3'
import { queryOne } from '~~/server/utils/db'
import { requireClientTrackingAccess, isUuid } from '~~/server/utils/client-access'

export interface QrCodeRow {
  id: string, client_id: string, folder_id: string | null, code: string, domain: string | null,
  name: string, destination_url: string, style: Record<string, unknown>, is_active: boolean,
  scan_count: number, last_scanned_at: string | null, created_by: string | null, created_at: string, updated_at: string
}

export const SHORT_HOST = 'https://app.xeroflow.io'
export const shortUrl = (code: string) => `${SHORT_HOST}/q/${code}`

/** Loads the code, then applies the per-client gate for its client. 400/404/403. */
export async function requireQrCodeAccess(event: H3Event, id: string | undefined) {
  if (!isUuid(id)) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })
  const row = await queryOne<QrCodeRow>(`SELECT * FROM qr_codes WHERE id = $1`, [id])
  if (!row) throw createError({ statusCode: 404, statusMessage: 'QR code not found' })
  const user = await requireClientTrackingAccess(event, row.client_id)
  return { user, row }
}

export async function requireFolderAccess(event: H3Event, id: string | undefined) {
  if (!isUuid(id)) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })
  const row = await queryOne<{ id: string, client_id: string, name: string }>(`SELECT * FROM qr_folders WHERE id = $1`, [id])
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Folder not found' })
  const user = await requireClientTrackingAccess(event, row.client_id)
  return { user, row }
}
