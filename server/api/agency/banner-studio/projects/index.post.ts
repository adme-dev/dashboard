import { requireAuth } from '~~/server/utils/auth'
import { executeGodModeBannerProjectCreation } from '~~/server/utils/banner/godModeProjectCreation'
import { findExistingTheBriefProject, readTheBriefProjectIdentity } from '~~/server/utils/banner/thebriefProjectImport'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readBody(event)

  const { name, clientId, canvasData, tags } = body

  if (!name?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Project name is required' })
  }

  const importIdentity = readTheBriefProjectIdentity(clientId, tags)

  try {
    const row = await executeGodModeBannerProjectCreation(event, async (db) => {
      if (importIdentity) {
        const existing = await findExistingTheBriefProject(db, importIdentity)
        if (existing) return existing
      }
      const result = await db.query(`
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
        importIdentity?.clientId || clientId || null,
        JSON.stringify(canvasData || {}),
        importIdentity?.tags || tags || [],
        user.id
      ])
      return result.rows[0]
    })
    if (!row) throw new Error('Banner project insert returned no row')
    return row
  } catch (error) {
    if ((error as { statusCode?: number })?.statusCode === 400) throw error
    console.error('Failed to create banner project:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to create banner project' })
  }
})
