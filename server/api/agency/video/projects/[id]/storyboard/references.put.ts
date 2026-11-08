import { createError, defineEventHandler, readBody } from 'h3'
import { requireWriteAccess } from '~~/server/utils/auth'
import { ReferenceSetWriteSchema } from '~~/shared/video/storyboardReferences'
import { saveReferenceSetIn } from '~~/server/utils/video-storyboard/store'
import { requireStoryboardEnabled } from '~~/server/utils/video-storyboard/policy'
import { executeStoryboardReferenceWrite } from '~~/server/utils/video-storyboard/godMode'
import { storyboardRouteId, storyboardRequestDependencies } from '~~/server/utils/video-storyboard/request'

export default defineEventHandler(async (event) => {
  const actor = await requireWriteAccess(event)
  requireStoryboardEnabled(event)
  const projectId = storyboardRouteId(event)
  const body = ReferenceSetWriteSchema.safeParse(await readBody(event))
  if (!body.success) throw createError({ statusCode: 400, statusMessage: 'Invalid storyboard reference request' })
  const referenceSet = await executeStoryboardReferenceWrite(event, db => saveReferenceSetIn(db, {
    ...body.data, projectId, actor
  }, storyboardRequestDependencies(event)))
  return { referenceSet }
})
