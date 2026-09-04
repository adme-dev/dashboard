import { z } from 'zod'

import {
  PageStudioHostnameSchema,
  resolvePageStudioReleaseHost
} from '~~/server/utils/pageStudio/delivery'
import { pageStudioInternalHttpError } from '~~/server/utils/pageStudio/http'
import { requirePageStudioMachineAuth } from '~~/server/utils/pageStudio/machineAuth'

const PublicHostnameQuerySchema = z.object({
  hostname: PageStudioHostnameSchema
}).strict()

export default eventHandler(async (event) => {
  try {
    requirePageStudioMachineAuth(event)
    const query = PublicHostnameQuerySchema.safeParse(getQuery(event))
    if (!query.success) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Invalid public hostname request',
        data: {
          error: {
            code: 'INVALID_INPUT',
            message: 'Invalid public hostname request'
          }
        }
      })
    }
    const resolved = await resolvePageStudioReleaseHost(query.data.hostname)
    if (!resolved) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Public release not found',
        data: {
          error: {
            code: 'PUBLIC_HOST_NOT_FOUND',
            message: 'Public release not found'
          }
        }
      })
    }
    return resolved
  } catch (error) {
    return pageStudioInternalHttpError(event, error)
  }
})
