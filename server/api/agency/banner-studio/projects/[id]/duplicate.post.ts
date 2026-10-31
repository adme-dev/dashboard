import { requireSocialClientAccess } from '~~/server/utils/social/clientAccess'
import { validateCanvasFontAssets, canvasFontLayers } from '~~/server/utils/banner/fontAssets'
import { transaction, queryOneFresh } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'
import {
  isBannerProvenanceTag, isMarketingPortfolioUser, requireMarketingBannerProjectAccess, type MarketingBannerProject
} from '~~/server/utils/banner/marketingProjectAccess'

const RETURNING = `
      RETURNING
        id, name, folder_id AS "folderId",
        client_id AS "clientId",
        canvas_data AS "canvasData",
        thumbnail_url AS "thumbnailUrl",
        status, tags,
        created_by AS "createdBy",
        created_at AS "createdAt",
        updated_at AS "updatedAt"`

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Project ID is required' })
  }

  return await transaction(async (db) => {
    const queryOne = async (sql: string, params: unknown[]) => (await db.query(sql, params)).rows[0] ?? null
    if (isMarketingPortfolioUser(user)) {
    // Marketing-management portfolio: same active client only, re-checked atomically by the INSERT.
    // A copy is new work, not an import: provenance identity stays with the original artwork.
      const source = await queryOneFresh<MarketingBannerProject & { name: string, canvas_data: unknown, folder_id?: string | null }>(
        'SELECT name, client_id, canvas_data, tags, created_by, folder_id FROM banner_projects WHERE id = $1',
        [id]
      )
      if (!source) throw createError({ statusCode: 404, statusMessage: 'Project not found' })
      await requireMarketingBannerProjectAccess(event, user, source)
      if (source.client_id && canvasFontLayers(source.canvas_data).some(layer => layer.fontAssetId)) await requireSocialClientAccess(event, source.client_id)
      await validateCanvasFontAssets(source.canvas_data, source.client_id, db)
      const row = await queryOne(`
      INSERT INTO banner_projects (name, client_id, canvas_data, tags, created_by, folder_id)
      SELECT $1, $2::uuid, $3::jsonb, $4::text[], $5, $6::uuid
      WHERE $2::uuid IS NULL OR EXISTS (SELECT 1 FROM agency_clients active_client
        WHERE active_client.id = $2::uuid AND active_client.is_active = TRUE)
      ${RETURNING}
    `, [
        source.name + ' (Copy)',
        source.client_id,
        JSON.stringify(source.canvas_data),
        (source.tags ?? []).filter(tag => !isBannerProvenanceTag(tag)),
        user.id,
        source.folder_id ?? null
      ])
      if (!row) throw createError({ statusCode: 403, statusMessage: 'No current access to this client' })
      return row
    }

    try {
      const source = await queryOne(`
      SELECT name, client_id, canvas_data, tags, folder_id
      FROM banner_projects WHERE id = $1
    `, [id])

      if (!source) {
        throw createError({ statusCode: 404, statusMessage: 'Project not found' })
      }

      if (source.client_id && canvasFontLayers(source.canvas_data).some(layer => layer.fontAssetId)) await requireSocialClientAccess(event, source.client_id)
      await validateCanvasFontAssets(source.canvas_data, source.client_id, db)
      const row = await queryOne(`
      INSERT INTO banner_projects (name, client_id, canvas_data, tags, created_by, folder_id)
      VALUES ($1, $2, $3, $4, $5, $6)
      ${RETURNING}
    `, [
        source.name + ' (Copy)',
        source.client_id,
        JSON.stringify(source.canvas_data),
        source.tags,
        user.id,
        source.folder_id ?? null
      ])

      return row
    } catch (error) {
      if (error && typeof error === 'object' && 'statusCode' in error) throw error
      console.error('Failed to duplicate banner project:', error)
      throw createError({ statusCode: 500, statusMessage: 'Failed to duplicate banner project' })
    }
  })
})
