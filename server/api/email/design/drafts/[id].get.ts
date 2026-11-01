import {
  createError,
  defineEventHandler,
  getCookie,
  getHeader,
  getRouterParam,
  setHeader
} from 'h3'
import { validateSession } from '~~/server/utils/auth'
import { queryRowsFresh } from '~~/server/utils/db'
import { assertFreshDesignAccess } from '~~/server/utils/email-marketing/designAccess'
import {
  DesignReadError,
  getTemplateDesignDraft
} from '~~/server/utils/email-marketing/designReads'

/** Read only: opening a draft must never create a baseline or rewrite content. */
export default defineEventHandler(async (event) => {
  setHeader(event, 'cache-control', 'no-store')
  if (event.context.cloudflare?.env?.FIGFLOW_EDM_DRAFT_SAVES_ENABLED !== 'true')
    throw createError({ statusCode: 404, statusMessage: 'not_found' })
  try {
    const authorization = getHeader(event, 'authorization')
    const token
      = getCookie(event, 'auth_token')
        || getCookie(event, 'auth_token_client')
        || (authorization?.startsWith('Bearer ') ? authorization.slice(7) : null)
    if (!token)
      throw createError({
        statusCode: 401,
        statusMessage: 'design_session_invalid'
      })
    const user = await validateSession(token)
    if (!user)
      throw createError({
        statusCode: 401,
        statusMessage: 'design_session_invalid'
      })
    const documentId = getRouterParam(event, 'id')
    if (!documentId)
      throw createError({
        statusCode: 400,
        statusMessage: 'invalid_design_target'
      })
    const draft = await getTemplateDesignDraft(
      documentId,
      async (clientId) => {
        await assertFreshDesignAccess(token, user.id, clientId, 'read')
      },
      {
        query: async (sql, params) => ({
          rows: await queryRowsFresh<unknown>(sql, params)
        })
      }
    )
    return { draft }
  } catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in error && error.statusCode === 403)
      throw createError({ statusCode: 404, statusMessage: 'NOT_FOUND' })
    if (error instanceof DesignReadError) {
      const statusCode
        = error.code === 'INVALID_DOCUMENT_ID'
          ? 400
          : error.code === 'NOT_FOUND'
            ? 404
            : error.code === 'INVALID_STORED_DESIGN'
              ? 503
              : 409
      throw createError({ statusCode, statusMessage: error.code })
    }
    if (error && typeof error === 'object' && 'statusCode' in error) throw error
    throw createError({
      statusCode: 503,
      statusMessage: 'design_read_unavailable'
    })
  }
})
