/** Create N variant codes under one campaign. POST /api/agency/qr-codes/bulk */
import { queryOne } from '~~/server/utils/db'
import { requireClientTrackingAccess } from '~~/server/utils/client-access'
import { executeQrMutation } from '~~/server/utils/qr/godModeMutations'
import { shortUrl } from '~~/server/utils/qr/access'
import { BulkQrSchema, expandName } from '~~/shared/qr/bulk'
import { generateSlug } from '~~/shared/qr/slug'
import { QR_UTM_MEDIUMS } from '~~/shared/qr/tracking'
import { validateDestinationUrl, isDestinationInvalid } from '~~/shared/qr/destination'

export default defineEventHandler(async (event) => {
  const parsed = BulkQrSchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: parsed.error.issues[0]?.message || 'Invalid body' })
  const body = parsed.data
  const user = await requireClientTrackingAccess(event, body.clientId)
  const dest = validateDestinationUrl(body.destinationUrl)
  if (isDestinationInvalid(dest)) throw createError({ statusCode: 400, statusMessage: dest.reason })
  if (!(QR_UTM_MEDIUMS as readonly string[]).includes(body.utmMedium)) throw createError({ statusCode: 400, statusMessage: 'Unknown placement' })
  if (body.folderId) {
    const f = await queryOne(`SELECT 1 FROM qr_folders WHERE id = $1 AND client_id = $2`, [body.folderId, body.clientId])
    if (!f) throw createError({ statusCode: 400, statusMessage: 'Folder does not belong to this client' })
  }
  if (body.campaignId) {
    const k = await queryOne(`SELECT 1 FROM qr_campaigns WHERE id = $1 AND client_id = $2`, [body.campaignId, body.clientId])
    if (!k) throw createError({ statusCode: 400, statusMessage: 'Campaign does not belong to this client' })
  }

  const result = await executeQrMutation(event, 'bulk-create', async (db) => {
    let campaignId = body.campaignId ?? null
    if (!campaignId) {
      const k = await db.query(`INSERT INTO qr_campaigns (client_id, name, created_by) VALUES ($1,$2,$3) RETURNING id`, [body.clientId, body.campaignName, user.id])
      campaignId = k.rows[0].id as string
    } else {
      await db.query(`UPDATE qr_campaigns SET updated_at = NOW() WHERE id = $1`, [campaignId])
    }
    const codes: any[] = []
    for (let i = 0; i < body.variants.length; i++) {
      const name = expandName(body.namePattern, body.baseName, body.variants[i]!, i)
      let created: any = null
      for (let attempt = 0; attempt < 5 && !created; attempt++) {
        const code = generateSlug()
        const exists = await db.query(`SELECT 1 FROM qr_codes WHERE code = $1`, [code])
        if (exists.rows[0]) continue
        const ins = await db.query(
          `INSERT INTO qr_codes (client_id, folder_id, campaign_id, code, name, destination_url, style, frame, created_by, utm_enabled, utm_medium, utm_source)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
          [body.clientId, body.folderId ?? null, campaignId, code, name, dest.url, JSON.stringify(body.style), JSON.stringify(body.frame), user.id, body.utmEnabled, body.utmMedium, body.utmSource || null])
        created = ins.rows[0]
        await db.query(`INSERT INTO qr_destination_history (qr_code_id, old_url, new_url, changed_by) VALUES ($1, NULL, $2, $3)`, [created.id, dest.url, user.id])
      }
      if (!created) throw createError({ statusCode: 500, statusMessage: 'Could not allocate a unique code' })
      codes.push(created)
    }
    return { id: campaignId, codes }
  }, async (db, id) => {
    const r = await db.query(`SELECT * FROM qr_codes WHERE campaign_id = $1 ORDER BY created_at ASC`, [id])
    return { id, codes: r.rows }
  })
  return { campaignId: result.id, codes: result.codes.map(c => ({ ...c, short_url: shortUrl(c.code) })) }
})
