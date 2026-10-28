/** Create a QR code. POST /api/agency/qr-codes */
import { requireQrClientAccess } from '~~/server/utils/qr/permissions'
import { CreateQrSchema } from '~~/server/utils/qr/schemas'
import { shortUrl } from '~~/server/utils/qr/access'
import { executeQrMutation } from '~~/server/utils/qr/godModeMutations'
import { createQrCodeRecord } from '~~/server/utils/qr/codeCreation'
import { validateDestinationUrl, isDestinationInvalid } from '~~/shared/qr/destination'

export default defineEventHandler(async (event) => {
  const parsed = CreateQrSchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: parsed.error.issues[0]?.message || 'Invalid body' })
  const body = parsed.data
  const user = await requireQrClientAccess(event, body.clientId)
  const dest = validateDestinationUrl(body.destinationUrl)
  if (isDestinationInvalid(dest)) throw createError({ statusCode: 400, statusMessage: dest.reason })
  const row = await executeQrMutation(event, 'code-create', db => createQrCodeRecord(db, body, user.id), async (db, id) => {
    const r = await db.query(`SELECT * FROM qr_codes WHERE id = $1`, [id])
    if (!r.rows[0]) throw new Error('Replayed QR code no longer exists')
    return r.rows[0]
  })
  return { code: row, shortUrl: shortUrl(row.code) }
})
