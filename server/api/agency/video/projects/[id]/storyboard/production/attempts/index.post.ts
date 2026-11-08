import { storyboardProductionDependencies } from '~~/server/utils/video-storyboard/productionRequest'
import { createError, defineEventHandler, readBody } from 'h3'
import { requireWriteAccess } from '~~/server/utils/auth'
import { requireStoryboardProductionEnabled } from '~~/server/utils/video-storyboard/productionPolicy'
import { executeStoryboardReferenceWrite } from '~~/server/utils/video-storyboard/godMode'
import { storyboardRouteId } from '~~/server/utils/video-storyboard/request'
import { ReserveShotProductionRequestSchema } from '~~/shared/video/storyboardProduction'
import { reserveShotAttemptIn } from '~~/server/utils/video-storyboard/production'

export default defineEventHandler(async (event) => {
  const actor = await requireWriteAccess(event)
  requireStoryboardProductionEnabled(event)
  const projectId = storyboardRouteId(event)
  const body = ReserveShotProductionRequestSchema.omit({ projectId: true }).safeParse(await readBody(event))
  if (!body.success) throw createError({ statusCode: 400, statusMessage: 'Invalid shot production request' })
  const attempt = await executeStoryboardReferenceWrite(event, db => reserveShotAttemptIn(db,
    { ...body.data, projectId, actor }, storyboardProductionDependencies(event)))
  return { attempt }
})
