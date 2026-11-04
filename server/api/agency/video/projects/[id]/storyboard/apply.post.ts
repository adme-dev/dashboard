import { createError, defineEventHandler, readBody } from 'h3'
import { requireWriteAccess } from '~~/server/utils/auth'
import { requireStoryboardEnabled } from '~~/server/utils/video-storyboard/policy'
import { storyboardRouteId, storyboardRequestDependencies } from '~~/server/utils/video-storyboard/request'
import { StoryboardApplyRequestSchema, prepareStoryboardApplication, applyStoryboardIn } from '~~/server/utils/video-storyboard/apply'
import { executeStoryboardReferenceWrite } from '~~/server/utils/video-storyboard/godMode'

export default defineEventHandler(async (event) => {
  const actor = await requireWriteAccess(event)
  requireStoryboardEnabled(event)
  const projectId = storyboardRouteId(event)
  const parsed = StoryboardApplyRequestSchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid storyboard application request' })
  const input = { ...parsed.data, actor, projectId }
  const deps = storyboardRequestDependencies(event)
  const prepared = await prepareStoryboardApplication(input, deps)
  // Flag may have changed while private media was measured.
  requireStoryboardEnabled(event)
  return executeStoryboardReferenceWrite(event, db => applyStoryboardIn(db, input, prepared, deps))
})
