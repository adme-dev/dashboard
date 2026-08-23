import { transaction } from '~~/server/utils/db'
import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { brandKitInputSchema, getBrandKit, setDefaultBrandKit, snapshotBrandKitVersion } from '~~/server/utils/banner/brandKits'

export default defineEventHandler(async (event) => {
  const user = await requireRole(event, PERMISSIONS.CREATIVE)
  const id = getRouterParam(event, 'id')!
  const existing = await getBrandKit(id)
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Brand kit not found' })

  const parsed = brandKitInputSchema.partial().safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: parsed.error.issues[0]?.message || 'Invalid brand kit' })
  }
  const input = parsed.data
  const contentChanged = ['name', 'colors', 'fonts', 'logos', 'guidelines'].some(k => k in input)

  await transaction(async (db) => {
    // Snapshot before changing content so every edit is recoverable
    if (contentChanged) await snapshotBrandKitVersion(db, id, user.id)
    await db.query(`
      UPDATE brand_kits SET
        name = COALESCE($2, name),
        client_id = CASE WHEN $3::boolean THEN $4::uuid ELSE client_id END,
        colors = COALESCE($5::jsonb, colors),
        fonts = COALESCE($6::jsonb, fonts),
        logos = COALESCE($7::jsonb, logos),
        guidelines = CASE WHEN $8::boolean THEN $9 ELSE guidelines END,
        source_url = CASE WHEN $10::boolean THEN $11 ELSE source_url END,
        updated_at = NOW()
      WHERE id = $1
    `, [
      id,
      input.name ?? null,
      'clientId' in input, input.clientId ?? null,
      input.colors ? JSON.stringify(input.colors) : null,
      input.fonts ? JSON.stringify(input.fonts) : null,
      input.logos ? JSON.stringify(input.logos) : null,
      'guidelines' in input, input.guidelines ?? null,
      'sourceUrl' in input, input.sourceUrl ?? null
    ])
  })

  if (input.isDefault === true) {
    await setDefaultBrandKit(id, 'clientId' in input ? (input.clientId ?? null) : existing.clientId)
  } else if (input.isDefault === false && existing.isDefault) {
    await transaction(db => db.query(`UPDATE brand_kits SET is_default = false WHERE id = $1`, [id]))
  }

  return await getBrandKit(id)
})
