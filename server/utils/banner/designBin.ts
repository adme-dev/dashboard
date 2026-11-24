import { createError, type H3Event } from 'h3'
import { requireWriteAccess } from '~~/server/utils/auth'
import { queryOneFresh, transaction } from '~~/server/utils/db'
import { hasAllBannerClientAccess, requireBannerClientAccess } from './clientAccess'
import { ACTIVE_PROJECT_CLIENT_SQL, assertMarketingBannerProjectDeletable, isMarketingPortfolioUser, requireMarketingBannerProjectAccess, type MarketingBannerProject } from './marketingProjectAccess'

export async function setDesignBinned(event: H3Event, id: string, bin: boolean) {
  const user = await requireWriteAccess(event)
  const project = await queryOneFresh<MarketingBannerProject>(
    'SELECT client_id, created_by, tags, review_status FROM banner_projects WHERE id = $1', [id])
  if (!project) throw createError({ statusCode: 404, statusMessage: 'Design not found' })
  const marketing = isMarketingPortfolioUser(user)
  if (marketing) {
    await requireMarketingBannerProjectAccess(event, user, project)
    if (bin) assertMarketingBannerProjectDeletable(project)
  } else if (project.client_id) await requireBannerClientAccess(event, project.client_id)
  else if (project.created_by !== user.id && !await hasAllBannerClientAccess(user)) {
    throw createError({ statusCode: 403, statusMessage: 'No access to this design' })
  }
  await transaction(async (db) => {
    const locked = await db.query(`SELECT id FROM banner_projects WHERE id = $1
      AND client_id IS NOT DISTINCT FROM $2::uuid AND review_status::text IS NOT DISTINCT FROM $3::text
      AND tags IS NOT DISTINCT FROM $4::text[] AND created_by IS NOT DISTINCT FROM $5::uuid
      ${marketing ? 'AND ' + ACTIVE_PROJECT_CLIENT_SQL : ''}
      AND (binned_at IS NULL OR binned_at > now() - interval '30 days') FOR UPDATE`,
    [id, project.client_id, project.review_status ?? null, project.tags, project.created_by])
    if (!locked.rows.length) throw createError({ statusCode: 409, statusMessage: 'Design changed or expired. Reload the library.' })
    await db.query(`UPDATE banner_projects SET binned_at = ${bin ? 'coalesce(binned_at, now())' : 'NULL'} WHERE id = $1`, [id])
  })
  return { success: true, message: bin ? 'Design moved to recycling bin' : 'Design restored' }
}
