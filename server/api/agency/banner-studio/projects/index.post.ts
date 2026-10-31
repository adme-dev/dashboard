import { validateCanvasFontAssets, canvasFontLayers } from '~~/server/utils/banner/fontAssets'
import { resolveBannerFolderId } from '~~/server/utils/banner/folders'
import { requireAuth, requireWriteAccess } from '~~/server/utils/auth'
import { executeGodModeBannerProjectCreation } from '~~/server/utils/banner/godModeProjectCreation'
import { findExistingTheBriefProject, readTheBriefProjectIdentity } from '~~/server/utils/banner/thebriefProjectImport'
import { requireSocialClientAccess } from '~~/server/utils/social/clientAccess'
import { isMarketingPortfolioUser, requireMarketingBannerProjectCreate } from '~~/server/utils/banner/marketingProjectAccess'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readBody(event)

  const { name, clientId, canvasData, tags } = body

  if (!name?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Project name is required' })
  }

  const folderId = await resolveBannerFolderId(body.folderId)
  const importIdentity = readTheBriefProjectIdentity(clientId, tags, canvasData)
  if (importIdentity) {
    // Deduplication can return saved canvas data, including on coordinator replay.
    // Check current write and client authority before either path can run.
    await requireWriteAccess(event)
    await requireSocialClientAccess(event, importIdentity.clientId)
  }
  // Marketing-management portfolio: active clients only; the INSERT re-checks the client atomically.
  const marketing = isMarketingPortfolioUser(user)
  if (marketing && !importIdentity) await requireMarketingBannerProjectCreate(event, user, { clientId, tags })

  try {
    if (canvasFontLayers(canvasData).some(layer => layer.fontAssetId) && clientId) await requireSocialClientAccess(event, clientId)
    const row = await executeGodModeBannerProjectCreation(event, async (db) => {
      if (importIdentity) {
        const existing = await findExistingTheBriefProject(db, importIdentity)
        if (existing) return { ...existing, importOutcome: 'existing' as const }
      }
      await validateCanvasFontAssets(canvasData, clientId || null, db)
      const result = await db.query(`
        INSERT INTO banner_projects (name, client_id, canvas_data, tags, created_by, folder_id)
        ${marketing
          ? `SELECT $1, $2::uuid, $3::jsonb, $4::text[], $5, $6::uuid WHERE $2::uuid IS NULL OR EXISTS (SELECT 1 FROM agency_clients active_client
            WHERE active_client.id = $2::uuid AND active_client.is_active = TRUE)`
          : 'VALUES ($1, $2, $3, $4, $5, $6)'}
        RETURNING
          id, name, folder_id AS "folderId",
          client_id AS "clientId",
          canvas_data AS "canvasData",
          thumbnail_url AS "thumbnailUrl",
          status, tags,
          created_by AS "createdBy",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
      `, [
        name.trim(),
        importIdentity?.clientId || clientId || null,
        JSON.stringify(canvasData || {}),
        importIdentity?.tags || tags || [],
        user.id,
        folderId
      ])
      if (marketing && !result.rows[0]) throw createError({ statusCode: 403, statusMessage: 'No current access to this client' })
      return result.rows[0]
    })
    if (!row) throw new Error('Banner project insert returned no row')
    // Lets the import dialog tell a new draft from a retry that resolved to a saved one.
    return importIdentity && !('importOutcome' in row) ? { ...row, importOutcome: 'created' } : row
  } catch (error) {
    const status = (error as { statusCode?: number })?.statusCode
    if (status === 400 || status === 403 || status === 409) throw error
    console.error('Failed to create banner project:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to create banner project' })
  }
})
