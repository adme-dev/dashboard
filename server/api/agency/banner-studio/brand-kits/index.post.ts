import { queryOne } from '~~/server/utils/db'
import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { brandKitInputSchema, getBrandKit, setDefaultBrandKit } from '~~/server/utils/banner/brandKits'

export default defineEventHandler(async (event) => {
  const user = await requireRole(event, PERMISSIONS.CREATIVE)
  const parsed = brandKitInputSchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: parsed.error.issues[0]?.message || 'Invalid brand kit' })
  }
  const input = parsed.data
  const row = await queryOne(`
    INSERT INTO brand_kits (name, client_id, colors, fonts, logos, guidelines, source_url, created_by)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING id
  `, [
    input.name,
    input.clientId || null,
    JSON.stringify(input.colors),
    JSON.stringify(input.fonts),
    JSON.stringify(input.logos),
    input.guidelines || null,
    input.sourceUrl || null,
    user.id
  ]) as { id: string }
  if (input.isDefault) await setDefaultBrandKit(row.id, input.clientId || null)
  return await getBrandKit(row.id)
})
