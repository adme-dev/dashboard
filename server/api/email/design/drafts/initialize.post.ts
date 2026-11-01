import {
  createError,
  defineEventHandler,
  getCookie,
  getHeader,
  setHeader
} from 'h3'
import { z } from 'zod'
import { validateSession } from '~~/server/utils/auth'
import { assertFreshDesignAccess } from '~~/server/utils/email-marketing/designAccess'
import { initializeTemplateDesignDraft } from '~~/server/utils/email-marketing/designInitialization'
import { DesignRevisionError } from '~~/server/utils/email-marketing/designRevisions'
import {
  assertDesignMutationRequest,
  readBoundedJson
} from '~~/server/utils/email-marketing/designRequest'

const Request = z
  .object({
    version: z.literal(1),
    templateId: z.string().uuid(),
    scope: z.object({ clientId: z.string().uuid().nullable() }).strict()
  })
  .strict()

export default defineEventHandler(async (event) => {
  setHeader(event, 'cache-control', 'no-store')
  const env = event.context.cloudflare?.env ?? {}
  if (env.FIGFLOW_EDM_DRAFT_SAVES_ENABLED !== 'true')
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
    const parsed = Request.safeParse(await readBoundedJson(event, 4096))
    if (!parsed.success)
      throw createError({
        statusCode: 400,
        statusMessage: 'invalid_design_target'
      })
    const authorize = async (clientId: string | null) => {
      const mode = await assertFreshDesignAccess(
        token,
        user.id,
        clientId,
        'write'
      )
      if (mode !== 'designer')
        throw createError({
          statusCode: 403,
          statusMessage: 'design_permission_required'
        })
    }
    await authorize(parsed.data.scope.clientId)
    const receipt = await initializeTemplateDesignDraft(
      {
        templateId: parsed.data.templateId,
        actorId: user.id,
        expectedClientId: parsed.data.scope.clientId
      },
      authorize
    )
    return {
      version: 1,
      draftId: receipt.documentId,
      revisionId: receipt.revisionId,
      schemaVersion: receipt.schemaVersion,
      origin: receipt.origin,
      published: false
    }
  } catch (error) {
    if (error instanceof DesignRevisionError)
      throw createError({
        statusCode: error.code === 'NOT_FOUND' ? 404 : 409,
        statusMessage: error.code
      })
    if (error && typeof error === 'object' && 'statusCode' in error) throw error
    throw createError({
      statusCode: 503,
      statusMessage: 'design_initialization_unavailable'
    })
  }
})
