import { requireWriteAccess } from '~~/server/utils/auth'
import { requireSocialClientAccess } from '~~/server/utils/social/clientAccess'
import { isMarketingPortfolioUser } from '~~/server/utils/banner/marketingProjectAccess'
import { transaction } from '~~/server/utils/db'
import { readTheBriefDraftRefresh, refreshTheBriefDraft } from '~~/server/utils/banner/thebriefDraftRefresh'

export default defineEventHandler(async (event) => {
  const user = await requireWriteAccess(event)
  // Preserve the existing portfolio boundary: imported artwork cannot be overwritten by this role.
  if (isMarketingPortfolioUser(user)) throw createError({ statusCode: 403, statusMessage: 'Imported source artwork is protected for this role; duplicate it to edit' })
  const id = getRouterParam(event, 'id')
  if (!id || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)) throw createError({ statusCode: 400, statusMessage: 'Invalid project ID' })
  const input = readTheBriefDraftRefresh(await readBody(event))
  await requireSocialClientAccess(event, input.clientId)
  try {
    const saved = await transaction(db => refreshTheBriefDraft(db, id, user.id, input))
    setHeader(event, 'Cache-Control', 'private, no-store')
    return saved
  } catch (error) {
    const failure = error as { code?: string, constraint?: string }
    // Legacy version writers do not take the project lock. Their unique-index collision must
    // roll back this entire refresh, including its mandatory backup, before reporting a conflict.
    if (failure?.code === '23505' && failure?.constraint === 'idx_banner_versions_project_number') {
      throw createError({ statusCode: 409, statusMessage: 'Version history changed during this update; reopen the draft before continuing' })
    }
    throw error
  }
})
