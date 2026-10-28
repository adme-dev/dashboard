import { queryOne, queryOneFresh, execute, transaction } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'
import {
  ACTIVE_PROJECT_CLIENT_SQL, assertMarketingBannerProjectDeletable, isMarketingPortfolioUser,
  requireMarketingBannerProjectAccess, type MarketingBannerProject
} from '~~/server/utils/banner/marketingProjectAccess'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Project ID is required' })
  }

  if (isMarketingPortfolioUser(user)) {
    // Marketing-management portfolio: active client, never protected artwork, and the delete is
    // bound to the checked state under a row lock.
    const project = await queryOneFresh<MarketingBannerProject>(
      'SELECT client_id, created_by, tags, review_status FROM banner_projects WHERE id = $1',
      [id]
    )
    if (!project) throw createError({ statusCode: 404, statusMessage: 'Project not found' })
    await requireMarketingBannerProjectAccess(event, user, project)
    assertMarketingBannerProjectDeletable(project)
    const deleted = await transaction(async (db) => {
      const locked = await db.query(`SELECT id FROM banner_projects
        WHERE id = $1 AND client_id IS NOT DISTINCT FROM $2::uuid AND review_status::text IS NOT DISTINCT FROM $3::text
          AND tags IS NOT DISTINCT FROM $4::text[] AND ${ACTIVE_PROJECT_CLIENT_SQL}
        FOR UPDATE`, [id, project.client_id, project.review_status ?? null, project.tags])
      if (!locked.rows.length) return false
      await db.query('DELETE FROM banner_dissections WHERE project_id = $1', [id])
      await db.query('DELETE FROM banner_projects WHERE id = $1', [id])
      return true
    })
    if (!deleted) throw createError({ statusCode: 409, statusMessage: 'Project or client access changed; reload before deleting' })
    return { success: true, message: 'Project deleted' }
  }

  try {
    const project = await queryOne('SELECT id FROM banner_projects WHERE id = $1', [id])
    if (!project) {
      throw createError({ statusCode: 404, statusMessage: 'Project not found' })
    }

    await execute('DELETE FROM banner_dissections WHERE project_id = $1', [id])
    await execute('DELETE FROM banner_projects WHERE id = $1', [id])

    return { success: true, message: 'Project deleted' }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to delete banner project:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to delete banner project' })
  }
})
