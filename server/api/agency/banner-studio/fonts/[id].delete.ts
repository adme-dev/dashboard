import { transaction } from '~~/server/utils/db'
import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { requireBrandKitWriteAccess } from '~~/server/utils/banner/brandKitAccess'
import { FONT_UUID } from '~~/server/utils/banner/fontAssets'
import { deleteBannerFile } from '~~/server/utils/bannerStorage'
import { resolveBannerAssetDelivery } from '~~/server/utils/banner/assetDelivery'

export default defineEventHandler(async (event) => {
  await requireRole(event, PERMISSIONS.CREATIVE)
  const id = getRouterParam(event, 'id')?.toLowerCase()
  if (!id || !FONT_UUID.test(id)) throw createError({ statusCode: 400, statusMessage: 'Valid font ID is required' })
  const key = await transaction(async (db) => {
    const result = await db.query<{ id: string, name: string, r2_key: string, client_id: string | null }>(
      `SELECT id, name, r2_key, client_id FROM banner_assets WHERE id = $1 AND 'font' = ANY(tags) FOR UPDATE`, [id])
    const asset = result.rows[0]
    if (!asset) throw createError({ statusCode: 404, statusMessage: 'Font not found' })
    await requireBrandKitWriteAccess(event, asset.client_id)
    // Legacy family references also protect fonts: existing artwork has no asset id.
    const used = await db.query(`WITH raw_refs AS (
      SELECT client_id, fonts AS content FROM brand_kits
      UNION ALL SELECT kit.client_id, version.snapshot->'fonts' FROM brand_kit_versions version JOIN brand_kits kit ON kit.id = version.brand_kit_id
      UNION ALL SELECT client_id, canvas_data FROM banner_projects
      UNION ALL SELECT project.client_id, version.canvas_data FROM banner_versions version JOIN banner_projects project ON project.id = version.project_id
    ), refs AS (
      SELECT client_id, CASE WHEN jsonb_typeof(content) = 'string' THEN (content #>> '{}')::jsonb ELSE content END AS content
      FROM raw_refs
    ) SELECT 1 FROM refs WHERE EXISTS (
      SELECT 1 FROM (
        SELECT value FROM jsonb_path_query(refs.content, '$.**.fontAssetId') AS ids(value)
        UNION ALL SELECT value FROM jsonb_path_query(refs.content, '$.**.id') AS ids(value)
      ) exact_refs WHERE lower(exact_refs.value #>> '{}') = lower($1::text)
    )
      OR (($3::uuid IS NULL OR refs.client_id = $3::uuid) AND jsonb_path_exists(content,
        '$.** ? ((!exists(@.fontAssetId) && @.fontFamily == $family) || ((!exists(@.assets) || @.assets.size() == 0) && @.family == $family))', jsonb_build_object('family', $2::text)))
    LIMIT 1`, [id, asset.name, asset.client_id])
    if (used.rows.length) throw createError({ statusCode: 409, statusMessage: 'Font is used by a brand kit, project or saved version' })
    await db.query('DELETE FROM banner_assets WHERE id = $1', [id])
    return asset.r2_key
  })
  const { nativeUpload } = resolveBannerAssetDelivery(event)
  await deleteBannerFile(key, nativeUpload?.bucket)
  return { success: true }
})
