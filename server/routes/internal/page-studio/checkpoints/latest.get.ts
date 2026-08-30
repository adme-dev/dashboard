import { getLatestPageStudioCheckpoint } from '~~/server/utils/pageStudio/controlStore'
import { PageStudioControlScopeSchema } from '~~/server/utils/pageStudio/controlSchemas'
import { pageStudioInternalHttpError } from '~~/server/utils/pageStudio/http'
import { requirePageStudioMachineAuth } from '~~/server/utils/pageStudio/machineAuth'

export default eventHandler(async (event) => {
  try {
    requirePageStudioMachineAuth(event)
    const parsed = PageStudioControlScopeSchema.safeParse(getQuery(event))
    if (!parsed.success) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Invalid checkpoint scope',
        data: { error: { code: 'INVALID_INPUT', message: 'Invalid checkpoint scope' } }
      })
    }
    const checkpoint = await getLatestPageStudioCheckpoint(parsed.data)
    if (!checkpoint) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Current checkpoint not found',
        data: {
          error: { code: 'CHECKPOINT_NOT_FOUND', message: 'Current checkpoint not found' }
        }
      })
    }
    return checkpoint
  } catch (error) {
    return pageStudioInternalHttpError(event, error)
  }
})
