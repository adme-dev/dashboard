import {
  assertDesignMutationRequest,
  readBoundedJson
} from '~~/server/utils/email-marketing/designRequest'
import {
  createError,
  defineEventHandler,
  getCookie,
  getHeader,
  getRouterParam,
  setHeader
} from 'h3'
import { validateSession } from '~~/server/utils/auth'
import { queryOneFresh } from '~~/server/utils/db'
import { assertFreshDesignAccess } from '~~/server/utils/email-marketing/designAccess'
import {
  DesignRevisionError,
  saveStaffTemplateDesignDraft,
  saveTemplateDesignDraft
} from '~~/server/utils/email-marketing/designRevisions'
import { createEmailRenderer } from '~~/server/utils/email-marketing/render/client'
import {
  EmailDesignActionError,
  validateDesignAction
} from '~~/shared/emailRendering/designActions'
import { EmailDesignError } from '~~/shared/emailRendering/designContract'

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
    const action = validateDesignAction(await readBoundedJson(event))
    if (
      action.action !== 'save-draft'
      || action.draftId !== getRouterParam(event, 'id')
      || action.design.kind !== 'template'
    )
      throw createError({
        statusCode: 400,
        statusMessage: 'invalid_design_target'
      })
    const mode = await assertFreshDesignAccess(
      token,
      user.id,
      action.scope.clientId,
      'write'
    )
    const authorize = async (clientId: string | null) => {
      const current = await assertFreshDesignAccess(
        token,
        user.id,
        clientId,
        'write'
      )
      if (mode === 'designer' && current !== 'designer')
        throw createError({
          statusCode: 403,
          statusMessage: 'design_permission_revoked'
        })
    }
    const save
      = mode === 'designer'
        ? saveTemplateDesignDraft
        : saveStaffTemplateDesignDraft
    const receipt = await save(
      {
        documentId: action.draftId,
        actorId: user.id,
        operationId: action.operationId,
        expectedRevisionId: action.expectedRevisionId,
        design: action.design
      },
      authorize,
      createEmailRenderer(env),
      undefined,
      {
        authorizeModuleRead: async (_moduleId, clientId) => {
          await assertFreshDesignAccess(token, user.id, clientId, 'read')
        }
      }
    )
    const revision = await queryOneFresh<{ created_at: string | Date }>(
      'SELECT created_at FROM email_design_revisions WHERE document_id=$1 AND id=$2',
      [receipt.documentId, receipt.revisionId]
    )
    if (!revision)
      throw createError({
        statusCode: 503,
        statusMessage: 'design_receipt_unavailable'
      })
    return {
      version: 1,
      ok: true,
      action: 'save-draft',
      operationId: action.operationId,
      draftId: receipt.documentId,
      revisionId: receipt.revisionId,
      savedAt: new Date(revision.created_at).toISOString(),
      published: false
    }
  } catch (error) {
    if (error instanceof EmailDesignActionError)
      throw createError({
        statusCode: error.code === 'ACTION_LIMIT_EXCEEDED' ? 413 : 400,
        statusMessage: error.code
      })
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
      statusMessage: 'design_save_unavailable'
    })
  }
})
