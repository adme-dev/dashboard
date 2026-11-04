import {
  createError,
  defineEventHandler,
  getCookie,
  getHeader,
  setHeader
} from 'h3'
import { ZodError } from 'zod'
import { validateSession } from '~~/server/utils/auth'
import { assertFreshDesignAccess } from '~~/server/utils/email-marketing/designAccess'
import {
  assertDesignMutationRequest,
  readBoundedJson
} from '~~/server/utils/email-marketing/designRequest'
import { saveDesignCondition } from '~~/server/utils/email-marketing/designConditions'
import { DesignRevisionError } from '~~/server/utils/email-marketing/designRevisions'
import { createEmailRenderer } from '~~/server/utils/email-marketing/render/client'
import { EmailConditionError } from '~~/shared/emailRendering/conditions'
import { EmailDesignError } from '~~/shared/emailRendering/designContract'

export default defineEventHandler(async (event) => {
  setHeader(event, 'cache-control', 'no-store')
  const env = event.context.cloudflare?.env ?? {}
  if (env.FIGFLOW_EDM_DRAFT_SAVES_ENABLED !== 'true' || env.FIGFLOW_EDM_DESIGNER_ENABLED !== 'true')
    throw createError({ statusCode: 404, statusMessage: 'not_found' })
  try {
    assertDesignMutationRequest(event, env.FIGFLOW_EDM_APP_ORIGIN)
    const authorization = getHeader(event, 'authorization')
    const token
      = getCookie(event, 'auth_token')
        || getCookie(event, 'auth_token_client')
        || (authorization?.startsWith('Bearer ') ? authorization.slice(7) : null)
    const user = token ? await validateSession(token) : null
    if (!user || !token)
      throw createError({
        statusCode: 401,
        statusMessage: 'design_session_invalid'
      })
    return await saveDesignCondition(
      await readBoundedJson(event),
      {
        actorId: user.id,
        authorize: (clientId, access) =>
          assertFreshDesignAccess(token, user.id, clientId, access)
      },
      createEmailRenderer(env)
    )
  } catch (error) {
    if (
      error instanceof ZodError
      || error instanceof EmailConditionError
      || error instanceof EmailDesignError
    )
      throw createError({
        statusCode: 400,
        statusMessage: 'invalid_condition_request'
      })
    if (error instanceof DesignRevisionError)
      throw createError({
        statusCode:
          error.code === 'NOT_FOUND'
            ? 404
            : error.code === 'RENDER_TIMEOUT'
              ? 503
              : 409,
        statusMessage: error.code
      })
    if (error && typeof error === 'object' && 'statusCode' in error) throw error
    throw createError({
      statusCode: 503,
      statusMessage: 'condition_save_unavailable'
    })
  }
})
