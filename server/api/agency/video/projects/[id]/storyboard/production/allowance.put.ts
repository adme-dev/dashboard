import { createError, defineEventHandler, readBody } from 'h3'
import { requireWriteAccess } from '~~/server/utils/auth'
import { SetShotProductionAllowanceRequestSchema } from '~~/shared/video/storyboardProduction'
import { requireStoryboardProductionEnabled, requireFreshProductionActorIn, requireProductionAllowanceAdministrator } from '~~/server/utils/video-storyboard/productionPolicy'
import { getProjectProductionAllowanceIn, setProjectProductionAllowanceIn } from '~~/server/utils/video-storyboard/productionBudget'
import { executeStoryboardReferenceWrite } from '~~/server/utils/video-storyboard/godMode'
import { requireStoryboardProjectIn } from '~~/server/utils/video-storyboard/access'
import { storyboardRouteId } from '~~/server/utils/video-storyboard/request'

export default defineEventHandler(async (event) => {
  const actor = await requireWriteAccess(event)
  requireStoryboardProductionEnabled(event)
  const projectId = storyboardRouteId(event)
  const body = SetShotProductionAllowanceRequestSchema.omit({ projectId: true }).safeParse(await readBody(event))
  if (!body.success) throw createError({ statusCode: 400, statusMessage: 'Invalid project allowance' })
  const allowance = await executeStoryboardReferenceWrite(event, async db => ({
    ...await setProjectProductionAllowanceIn(db, { ...body.data, projectId, actor }), id: projectId
  }), async (db, receiptId) => {
    if (receiptId !== projectId) throw createError({ statusCode: 409, statusMessage: 'Allowance receipt mismatch' })
    const freshActor = await requireFreshProductionActorIn(db, actor)
    requireProductionAllowanceAdministrator(freshActor)
    await requireStoryboardProjectIn(db, projectId, freshActor)
    // Replay is read-only: never overwrite a later administrator's allowance.
    return { ...await getProjectProductionAllowanceIn(db, projectId), id: projectId }
  })
  return { allowance }
})
