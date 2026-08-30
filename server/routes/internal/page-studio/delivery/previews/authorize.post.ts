import { z } from 'zod'

import {
  authorizePageStudioPreview,
  PageStudioHostnameSchema
} from '~~/server/utils/pageStudio/delivery'
import { pageStudioInternalHttpError } from '~~/server/utils/pageStudio/http'
import { requirePageStudioMachineAuth } from '~~/server/utils/pageStudio/machineAuth'

const PreviewAuthorizationBodySchema = z.object({
  hostname: PageStudioHostnameSchema
}).strict()

export default eventHandler(async (event) => {
  try {
    requirePageStudioMachineAuth(event)
    const body = PreviewAuthorizationBodySchema.safeParse(await readBody(event))
    const token = getHeader(event, 'x-xeroflow-preview-token')
    if (!body.success || !token || token.length > 8192) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Invalid preview authorization request',
        data: {
          error: {
            code: 'INVALID_INPUT',
            message: 'Invalid preview authorization request'
          }
        }
      })
    }
    const authorized = await authorizePageStudioPreview({
      hostname: body.data.hostname,
      token
    }, { event })
    if (!authorized) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Preview release not found',
        data: {
          error: {
            code: 'PREVIEW_NOT_FOUND',
            message: 'Preview release not found'
          }
        }
      })
    }
    return authorized
  } catch (error) {
    return pageStudioInternalHttpError(event, error)
  }
})
