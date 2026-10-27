import { hasScopedCanvas } from '#shared/bannerScopedCanvas'
import { assertScopedCanvasAccess, withScopedCanvasAccess } from '~~/server/utils/banner/scopedCanvasAccess'
import type { GodModeTransactionDb } from '~~/server/utils/godMode/transactionCoordinator'
import { requireWriteAccess } from '~~/server/utils/auth'
import { executeGodModeBannerProjectCreation } from '~~/server/utils/banner/godModeProjectCreation'
import { findExistingTheBriefProject, readTheBriefProjectIdentity } from '~~/server/utils/banner/thebriefProjectImport'
import { requireSocialClientAccess } from '~~/server/utils/social/clientAccess'
import { validateBannerPlatformQrCanvas } from '~~/server/utils/banner/platformQrCanvas'

export default defineEventHandler(async (event) => {
  const user = await requireWriteAccess(event)
  const body = await readBody(event)

  const { name, clientId, canvasData, tags } = body

  if (!name?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Project name is required' })
  }

  const importIdentity = readTheBriefProjectIdentity(clientId, tags)
  const destinationClientId = importIdentity?.clientId || clientId || null
  if (destinationClientId) await requireSocialClientAccess(event, destinationClientId)
  await validateBannerPlatformQrCanvas(event, {}, canvasData || {}, destinationClientId)

  try {
    const create = async (db: GodModeTransactionDb) => {
      if (importIdentity) {
        const existing = await findExistingTheBriefProject(db, importIdentity)
        if (existing) {
          if (hasScopedCanvas(existing.canvasData)) {
            throw createError({ statusCode: 409, statusMessage: 'Protected artwork cannot be reused through this import' })
          }
          await validateBannerPlatformQrCanvas(event, {}, existing.canvasData, existing.clientId)
          return existing
        }
      }
      const result = await db.query<any>(`
        INSERT INTO banner_projects (name, client_id, canvas_data, tags, created_by)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING
          id, name,
          client_id AS "clientId",
          canvas_data AS "canvasData",
          thumbnail_url AS "thumbnailUrl",
          status, tags,
          created_by AS "createdBy",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
      `, [
        name.trim(),
        destinationClientId,
        JSON.stringify(canvasData || {}),
        importIdentity?.tags || tags || [],
        user.id
      ])
      return result.rows[0]
    }
    const row = hasScopedCanvas(canvasData)
      ? await withScopedCanvasAccess(user.id, canvasData, undefined, 'write', create, { clientId: destinationClientId })
      : await executeGodModeBannerProjectCreation(event, create)
    if (!row) throw new Error('Banner project insert returned no row')
    // Coordinator replay may return a saved document without running the create callback.
    if (row.clientId) await requireSocialClientAccess(event, row.clientId)
    await validateBannerPlatformQrCanvas(event, {}, row.canvasData, row.clientId || null)
    await assertScopedCanvasAccess(user.id, row.canvasData, row.id)
    return row
  } catch (error) {
    if ((error as { statusCode?: number })?.statusCode) throw error
    console.error('Failed to create banner project:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to create banner project' })
  }
})
