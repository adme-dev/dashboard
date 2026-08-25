import { queryOne } from '~~/server/utils/db'
import { requireQrCodeAccess, shortUrl } from '~~/server/utils/qr/access'
import { UpdateQrSchema } from '~~/server/utils/qr/schemas'
import { invalidateQrCache } from '~~/server/utils/qr/resolve'
import { validateDestinationUrl, isDestinationInvalid } from '~~/shared/qr/destination'

export default defineEventHandler(async (event) => {
  const { user, row } = await requireQrCodeAccess(event, getRouterParam(event, 'id'))
  const parsed = UpdateQrSchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: parsed.error.issues[0]?.message || 'Invalid body' })
  const b = parsed.data
  const sets: string[] = []; const params: unknown[] = []
  const set = (col: string, v: unknown) => { params.push(v); sets.push(`${col} = $${params.length}`) }

  if (b.name !== undefined) set('name', b.name)
  if (b.isActive !== undefined) set('is_active', b.isActive)
  if (b.style !== undefined) set('style', JSON.stringify(b.style))
  if (b.utmEnabled !== undefined) set('utm_enabled', b.utmEnabled)
  if (b.utmMedium !== undefined) set('utm_medium', b.utmMedium)
  if (b.utmSource !== undefined) set('utm_source', b.utmSource || null)
  if (b.folderId !== undefined) {
    if (b.folderId) {
      const f = await queryOne(`SELECT 1 FROM qr_folders WHERE id = $1 AND client_id = $2`, [b.folderId, row.client_id])
      if (!f) throw createError({ statusCode: 400, statusMessage: 'Folder does not belong to this client' })
    }
    set('folder_id', b.folderId)
  }
  let newUrl: string | null = null
  if (b.destinationUrl !== undefined) {
    const d = validateDestinationUrl(b.destinationUrl)
    if (isDestinationInvalid(d)) throw createError({ statusCode: 400, statusMessage: d.reason })
    if (d.url !== row.destination_url) { newUrl = d.url; set('destination_url', d.url) }
  }
  if (!sets.length) return { code: row, shortUrl: shortUrl(row.code) }

  params.push(row.id)
  const updated = await queryOne<any>(`UPDATE qr_codes SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${params.length} RETURNING *`, params)
  if (newUrl) await queryOne(`INSERT INTO qr_destination_history (qr_code_id, old_url, new_url, changed_by) VALUES ($1,$2,$3,$4) RETURNING id`, [row.id, row.destination_url, newUrl, user.id])
  // Anything that changes the redirect target or tagging must drop the KV copy.
  if (newUrl || b.isActive !== undefined || b.name !== undefined || b.folderId !== undefined || b.utmEnabled !== undefined || b.utmMedium !== undefined || b.utmSource !== undefined) await invalidateQrCache(event, row.code)
  return { code: updated, shortUrl: shortUrl(row.code) }
})
