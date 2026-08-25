/** Create a QR code. POST /api/agency/qr-codes */
import { queryOne } from '~~/server/utils/db'
import { requireClientTrackingAccess } from '~~/server/utils/client-access'
import { CreateQrSchema } from '~~/server/utils/qr/schemas'
import { shortUrl } from '~~/server/utils/qr/access'
import { executeQrMutation } from '~~/server/utils/qr/godModeMutations'
import { generateSlug } from '~~/shared/qr/slug'
import { validateDestinationUrl, isDestinationInvalid } from '~~/shared/qr/destination'

export default defineEventHandler(async (event) => {
  const parsed = CreateQrSchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: parsed.error.issues[0]?.message || 'Invalid body' })
  const body = parsed.data
  const user = await requireClientTrackingAccess(event, body.clientId)
  const dest = validateDestinationUrl(body.destinationUrl)
  if (isDestinationInvalid(dest)) throw createError({ statusCode: 400, statusMessage: dest.reason })
  if (body.folderId) {
    const f = await queryOne(`SELECT 1 FROM qr_folders WHERE id = $1 AND client_id = $2`, [body.folderId, body.clientId])
    if (!f) throw createError({ statusCode: 400, statusMessage: 'Folder does not belong to this client' })
  }
  const row = await executeQrMutation(event, 'code-create', async (db) => {
    // Slug collisions are rare (base58^7); retry inside the transaction so the ledger sees one attempt.
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = generateSlug()
      const exists = await db.query(`SELECT 1 FROM qr_codes WHERE code = $1`, [code])
      if (exists.rows[0]) continue
      const inserted = await db.query(
        `INSERT INTO qr_codes (client_id, folder_id, code, name, destination_url, style, created_by, utm_enabled, utm_medium, utm_source)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [body.clientId, body.folderId ?? null, code, body.name, dest.url, JSON.stringify(body.style), user.id, body.utmEnabled, body.utmMedium, body.utmSource || null])
      const created = inserted.rows[0]
      await db.query(`INSERT INTO qr_destination_history (qr_code_id, old_url, new_url, changed_by) VALUES ($1, NULL, $2, $3)`, [created.id, dest.url, user.id])
      return created
    }
    throw createError({ statusCode: 500, statusMessage: 'Could not allocate a unique code' })
  }, async (db, id) => {
    const r = await db.query(`SELECT * FROM qr_codes WHERE id = $1`, [id])
    if (!r.rows[0]) throw new Error('Replayed QR code no longer exists')
    return r.rows[0]
  })
  return { code: row, shortUrl: shortUrl(row.code) }
})
