import {
  PageStudioControlIdSchema,
  PageStudioControlScopeSchema
} from '~~/server/utils/pageStudio/controlSchemas'
import { pageStudioInternalHttpError } from '~~/server/utils/pageStudio/http'
import { requirePageStudioMachineAuth } from '~~/server/utils/pageStudio/machineAuth'
import { getPageStudioBuildPointer } from '~~/server/utils/pageStudio/publishing'

export default eventHandler(async (event) => {
  try {
    requirePageStudioMachineAuth(event)
    const scope = PageStudioControlScopeSchema.safeParse(getQuery(event))
    const buildId = PageStudioControlIdSchema.safeParse(getRouterParam(event, 'buildId'))
    if (!scope.success || !buildId.success) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Invalid build lookup',
        data: { error: { code: 'INVALID_INPUT', message: 'Invalid build lookup' } }
      })
    }
    const build = await getPageStudioBuildPointer(scope.data, buildId.data)
    if (!build) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Page Studio build not found',
        data: { error: { code: 'BUILD_NOT_FOUND', message: 'Page Studio build not found' } }
      })
    }
    return build
  } catch (error) {
    return pageStudioInternalHttpError(event, error)
  }
})
