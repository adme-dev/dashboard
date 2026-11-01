import { createError, defineEventHandler, getCookie, getHeader, setHeader } from 'h3'
import { ZodError } from 'zod'
import { validateSession } from '~~/server/utils/auth'
import { assertFreshDesignAccess } from '~~/server/utils/email-marketing/designAccess'
import { assertDesignMutationRequest, readBoundedJson } from '~~/server/utils/email-marketing/designRequest'
import { DesignHandoffError, executeDesignRoundtrip } from '~~/server/utils/email-marketing/designHandoffs'
import { DesignRevisionError } from '~~/server/utils/email-marketing/designRevisions'
import { DesignReadError } from '~~/server/utils/email-marketing/designReads'
import { createEmailRenderer } from '~~/server/utils/email-marketing/render/client'
import { parseRoundtripRequest } from '~~/shared/emailRendering/designRoundtrip'
import { EmailDesignError } from '~~/shared/emailRendering/designContract'
import { EmailDesignActionError } from '~~/shared/emailRendering/designActions'

export default defineEventHandler(async (event) => {
  setHeader(event, 'cache-control', 'no-store')
  const env = event.context.cloudflare?.env ?? {}
  if (env.FIGFLOW_EDM_DRAFT_SAVES_ENABLED !== 'true') throw createError({ statusCode: 404, statusMessage: 'not_found' })
  try {
    assertDesignMutationRequest(event, env.FIGFLOW_EDM_APP_ORIGIN)
    const authorization = getHeader(event, 'authorization')
    const token = getCookie(event, 'auth_token') || getCookie(event, 'auth_token_client')
      || (authorization?.startsWith('Bearer ') ? authorization.slice(7) : null)
    const user = token ? await validateSession(token) : null
    if (!user || !token) throw createError({ statusCode: 401, statusMessage: 'design_session_invalid' })
    const request = parseRoundtripRequest(await readBoundedJson(event))
    return await executeDesignRoundtrip(request, {
      actorId: user.id,
      authorize: (clientId, access) => assertFreshDesignAccess(token, user.id, clientId, access)
    }, createEmailRenderer(env))
  } catch (error) {
    if (error instanceof ZodError || error instanceof EmailDesignActionError || error instanceof EmailDesignError)
      throw createError({ statusCode: 'code' in error && ['LIMIT_EXCEEDED', 'ACTION_LIMIT_EXCEEDED'].includes(error.code) ? 413 : 400, statusMessage: 'invalid_design_request' })
    if (error instanceof DesignHandoffError || error instanceof DesignRevisionError || error instanceof DesignReadError)
      throw createError({ statusCode: error.code === 'NOT_FOUND' ? 404 : error.code === 'DESIGNER_REQUIRED' ? 403 : 409, statusMessage: error.code })
    if (error && typeof error === 'object' && 'statusCode' in error) throw error
    throw createError({ statusCode: 503, statusMessage: 'design_handoff_unavailable' })
  }
})
