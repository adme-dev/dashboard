import { defineEventHandler } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { transaction } from '~~/server/utils/db'
import { requireStoryboardProjectIn } from '~~/server/utils/video-storyboard/access'
import { getProjectProductionAllowanceIn } from '~~/server/utils/video-storyboard/productionBudget'
import { storyboardRouteId } from '~~/server/utils/video-storyboard/request'

export default defineEventHandler(async (event) => {
  const actor = await requireAuth(event)
  const projectId = storyboardRouteId(event)
  const allowance = await transaction(async (db) => {
    await requireStoryboardProjectIn(db, projectId, actor)
    return getProjectProductionAllowanceIn(db, projectId)
  })
  return { allowance }
})
