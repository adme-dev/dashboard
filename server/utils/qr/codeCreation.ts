import { createError } from 'h3'
import type { z } from 'zod'
import { CreateQrSchema } from './schemas'
import { generateSlug } from '~~/shared/qr/slug'
import { validateDestinationUrl, isDestinationInvalid } from '~~/shared/qr/destination'

interface QrCreationDb { query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }> }
/** Shared local insert. Caller owns authority and the containing transaction/idempotency receipt. */
export async function createQrCodeRecord(db: QrCreationDb, input: z.infer<typeof CreateQrSchema>, actorId: string) {
  const body = CreateQrSchema.parse(input)
  const dest = validateDestinationUrl(body.destinationUrl)
  if (isDestinationInvalid(dest)) throw createError({ statusCode: 400, statusMessage: dest.reason })
  if (body.folderId && !(await db.query('SELECT id FROM qr_folders WHERE id = $1 AND client_id = $2', [body.folderId, body.clientId])).rows[0]) {
    throw createError({ statusCode: 400, statusMessage: 'Folder does not belong to this client' })
  }
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateSlug()
    const result = await db.query(`INSERT INTO qr_codes (client_id, folder_id, code, name, destination_url, style, created_by, utm_enabled, utm_medium, utm_source, frame, ab)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT (code) DO NOTHING RETURNING *`,
    [body.clientId, body.folderId ?? null, code, body.name, dest.url, JSON.stringify(body.style), actorId, body.utmEnabled, body.utmMedium, body.utmSource || null, JSON.stringify(body.frame), JSON.stringify(body.ab)])
    const row = result.rows[0]
    if (!row) continue
    await db.query('INSERT INTO qr_destination_history (qr_code_id, old_url, new_url, changed_by) VALUES ($1,NULL,$2,$3)', [row.id, dest.url, actorId])
    return row
  }
  throw createError({ statusCode: 500, statusMessage: 'Could not allocate a unique code' })
}
