import { transaction } from '~~/server/utils/db'
import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { getBrandKit, snapshotBrandKitVersion } from '~~/server/utils/banner/brandKits'

/** POST /brand-kits/:id/restore { version } — roll content back to a snapshot (current state is versioned first) */
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, PERMISSIONS.CREATIVE)
  const id = getRouterParam(event, 'id')!
  const { version } = await readBody(event) as { version?: number }
  if (!Number.isInteger(version)) throw createError({ statusCode: 400, statusMessage: 'version is required' })

  await transaction(async (db) => {
    const v = await db.query(`SELECT snapshot FROM brand_kit_versions WHERE brand_kit_id = $1 AND version = $2`, [id, version])
    const snap = v.rows?.[0]?.snapshot
    if (!snap) throw createError({ statusCode: 404, statusMessage: 'Version not found' })
    await snapshotBrandKitVersion(db, id, user.id, `Before restoring v${version}`)
    await db.query(`
      UPDATE brand_kits SET name = $2, colors = $3, fonts = $4, logos = $5, guidelines = $6, updated_at = NOW()
      WHERE id = $1
    `, [id, snap.name, JSON.stringify(snap.colors), JSON.stringify(snap.fonts), JSON.stringify(snap.logos), snap.guidelines])
  })
  return await getBrandKit(id)
})
