import { requireWriteAccess } from '~~/server/utils/auth'
import { listSelectableVideoGenerationModels } from '~~/server/utils/video-generation/modelRegistry'
import { selectableVideoModelOptions } from '~~/app/utils/video/modelPresentation'

export default defineEventHandler(async (event) => {
  if (process.env.VIDEO_GENERATION_ENABLED !== 'true') {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }
  await requireWriteAccess(event)
  return { models: selectableVideoModelOptions(listSelectableVideoGenerationModels()) }
})
