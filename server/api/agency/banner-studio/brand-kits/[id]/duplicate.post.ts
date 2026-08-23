import { queryOne } from '~~/server/utils/db'
import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { getBrandKit } from '~~/server/utils/banner/brandKits'

/** POST /brand-kits/:id/duplicate — copy a kit (never copies the default flag) */
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, PERMISSIONS.CREATIVE)
  const id = getRouterParam(event, 'id')!
  const src = await getBrandKit(id)
  if (!src) throw createError({ statusCode: 404, statusMessage: 'Brand kit not found' })
  const row = await queryOne(`
    INSERT INTO brand_kits (name, client_id, colors, fonts, logos, guidelines, source_url, created_by)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id
  `, [
    `${src.name} (copy)`, src.clientId, JSON.stringify(src.colors), JSON.stringify(src.fonts),
    JSON.stringify(src.logos), src.guidelines, src.sourceUrl || null, user.id
  ]) as { id: string }
  return await getBrandKit(row.id)
})
