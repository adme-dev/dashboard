import {
  createError,
  defineEventHandler,
  getCookie,
  getHeader,
  getQuery,
  setHeader
} from 'h3'
import { z } from 'zod'
import { validateSession } from '~~/server/utils/auth'
import { queryOneFresh } from '~~/server/utils/db'
import { assertFreshDesignAccess } from '~~/server/utils/email-marketing/designAccess'

/** Discovery is advisory; POST revalidates independently after writer locks. */
export default defineEventHandler(async (event) => {
  setHeader(event, 'cache-control', 'no-store')
  const env = event.context.cloudflare?.env ?? {}
  if (env.FIGFLOW_EDM_DRAFT_SAVES_ENABLED !== 'true')
    throw createError({ statusCode: 404, statusMessage: 'not_found' })
  const id = z.string().uuid().safeParse(getQuery(event).documentId)
  if (!id.success)
    throw createError({ statusCode: 400, statusMessage: 'invalid_document_id' })
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
  const row = await queryOneFresh<{
    client_id: string | null
    owner_client_id: string | null
    template_kind: string
  }>(
    `SELECT d.client_id,t.client_id AS owner_client_id,t.template_kind
    FROM email_design_documents d JOIN edm_templates t ON t.id=d.template_id WHERE d.id=$1`,
    [id.data]
  )
  if (!row) throw createError({ statusCode: 404, statusMessage: 'not_found' })
  const mode = await assertFreshDesignAccess(
    token,
    user.id,
    row.client_id,
    'write'
  )
  return {
    canEdit:
      mode === 'designer'
      && !!row.client_id
      && row.client_id === row.owner_client_id
      && row.template_kind === 'draft',
    clientId: row.client_id
  }
})
