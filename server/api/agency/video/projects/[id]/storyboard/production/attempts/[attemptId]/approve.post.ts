import { storyboardProductionDependencies } from '~~/server/utils/video-storyboard/productionRequest'
import { createError, defineEventHandler, readBody } from 'h3'
import { requireWriteAccess } from '~~/server/utils/auth'
import { requireStoryboardProductionEnabled } from '~~/server/utils/video-storyboard/productionPolicy'
import { executeStoryboardReferenceWrite } from '~~/server/utils/video-storyboard/godMode'
import { storyboardRouteId } from '~~/server/utils/video-storyboard/request'
import { ApproveShotProductionRequestSchema } from '~~/shared/video/storyboardProduction'
import { approveShotArtifactIn } from '~~/server/utils/video-storyboard/production'

export default defineEventHandler(async (event) => {
  const actor = await requireWriteAccess(event)
  requireStoryboardProductionEnabled(event)
  const projectId = storyboardRouteId(event)
  const attemptId = storyboardRouteId(event, 'attemptId')
  const body = ApproveShotProductionRequestSchema.omit({ projectId: true, attemptId: true }).safeParse(await readBody(event))
  if (!body.success) throw createError({ statusCode: 400, statusMessage: 'Invalid artifact approval request' })
  const attempt = await executeStoryboardReferenceWrite(event, db => approveShotArtifactIn(db,
    { ...body.data, projectId, attemptId, actor }, storyboardProductionDependencies(event)))
  return { attempt }
})
