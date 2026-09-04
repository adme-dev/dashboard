import {
  PageStudioControlIdSchema,
  PageStudioControlScopeSchema
} from '~~/server/utils/pageStudio/controlSchemas'
import { pageStudioInternalHttpError } from '~~/server/utils/pageStudio/http'
import { requirePageStudioMachineAuth } from '~~/server/utils/pageStudio/machineAuth'
import { getPageStudioReleasePointer } from '~~/server/utils/pageStudio/publishing'

export default eventHandler(async (event) => {
  try {
    requirePageStudioMachineAuth(event)
    const scope = PageStudioControlScopeSchema.safeParse(getQuery(event))
    const releaseId = PageStudioControlIdSchema.safeParse(getRouterParam(event, 'releaseId'))
    if (!scope.success || !releaseId.success) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Invalid release lookup',
        data: { error: { code: 'INVALID_INPUT', message: 'Invalid release lookup' } }
      })
    }
    const release = await getPageStudioReleasePointer(scope.data, releaseId.data)
    if (!release) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Page Studio release not found',
        data: { error: { code: 'RELEASE_NOT_FOUND', message: 'Page Studio release not found' } }
      })
    }
    return release
  } catch (error) {
    return pageStudioInternalHttpError(event, error)
  }
})
