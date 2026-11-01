import {
  createError,
  defineEventHandler,
  getCookie,
  getHeader,
  getRouterParam,
  setHeader
} from 'h3'
import { z } from 'zod'
import { EmailDesignError } from '~~/shared/emailRendering/designContract'
import { validateSession } from '~~/server/utils/auth'
import { assertFreshDesignAccess } from '~~/server/utils/email-marketing/designAccess'
import {
  assertDesignMutationRequest,
  readBoundedJson
} from '~~/server/utils/email-marketing/designRequest'
import { saveTemplateDraftMetadata } from '~~/server/utils/email-marketing/designMetadata'
import { DesignRevisionError } from '~~/server/utils/email-marketing/designRevisions'
import { createEmailRenderer } from '~~/server/utils/email-marketing/render/client'

const Body = z
  .object({
    version: z.literal(1),
    operationId: z.string().uuid(),
    expectedRevisionId: z.string().uuid(),
    scope: z.object({ clientId: z.string().uuid().nullable() }).strict(),
    subject: z.string().max(300).nullable(),
    previewText: z.string().max(300).nullable()
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
    const parsed = Body.safeParse(await readBoundedJson(event, 4096))
    const documentId = z.string().uuid().safeParse(getRouterParam(event, 'id'))
    if (!parsed.success || !documentId.success)
      throw createError({
        statusCode: 400,
        statusMessage: 'invalid_design_metadata'
      })
    const authorize = async (clientId: string | null) => {
      await assertFreshDesignAccess(token, user.id, clientId, 'write')
    }
    await authorize(parsed.data.scope.clientId)
    const receipt = await saveTemplateDraftMetadata(
      {
        documentId: documentId.data,
        actorId: user.id,
        operationId: parsed.data.operationId,
        expectedRevisionId: parsed.data.expectedRevisionId,
        expectedClientId: parsed.data.scope.clientId,
        subject: parsed.data.subject,
        previewText: parsed.data.previewText
      },
      authorize,
      createEmailRenderer(env),
      undefined,
      async (_moduleId, clientId) => {
        await assertFreshDesignAccess(token, user.id, clientId, 'read')
      }
    )
    return {
      version: 1,
      draftId: receipt.documentId,
      revisionId: receipt.revisionId,
      published: false
    }
  } catch (error) {
    if (error instanceof EmailDesignError)
      throw createError({
        statusCode:
          error.code === 'LIMIT_EXCEEDED'
            ? 413
            : ['EDIT_FORBIDDEN', 'POLICY_CHANGE_FORBIDDEN'].includes(error.code)
                ? 403
                : 400,
        statusMessage: error.code
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
      statusMessage: 'design_metadata_unavailable'
    })
  }
})
