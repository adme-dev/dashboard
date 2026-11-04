import { DESIGN_REVISION_CONSTRAINTS, rethrowLegacyDesignConflict } from './designConflict'
import { createError, getCookie, getHeader, setHeader, type H3Event } from 'h3'
import { ZodError } from 'zod'
import { validateSession } from '~~/server/utils/auth'
import { assertFreshDesignAccess, assertFreshDesignPublisher } from './designAccess'
import { assertDesignMutationRequest, readBoundedJson } from './designRequest'
import { DesignModuleError } from '../../../shared/emailRendering/designModules'
import { EmailDesignError } from '../../../shared/emailRendering/designContract'
import { DesignReadError } from './designReads'
import { DesignRevisionError } from './designRevisions'
import type { ModuleAuthority } from './designModules'

export async function designLibrarySession(event: H3Event, mutation: boolean) {
  setHeader(event, 'cache-control', 'private, no-store')
  const env = event.context.cloudflare?.env ?? {}
  if (env.FIGFLOW_EDM_DRAFT_SAVES_ENABLED !== 'true' || env.FIGFLOW_EDM_DESIGNER_ENABLED !== 'true' || env.FIGFLOW_EDM_LIBRARY_ENABLED !== 'true') throw createError({ statusCode: 404, statusMessage: 'not_found' })
  if (mutation) assertDesignMutationRequest(event, env.FIGFLOW_EDM_APP_ORIGIN)
  const authorization = getHeader(event, 'authorization')
  const token = getCookie(event, 'auth_token') || getCookie(event, 'auth_token_client') || (authorization?.startsWith('Bearer ') ? authorization.slice(7) : null)
  const user = token ? await validateSession(token) : null
  if (!token || !user) throw createError({ statusCode: 401, statusMessage: 'design_session_invalid' })
  const authority: ModuleAuthority = {
    actorId: user.id,
    contentWrite: scope => assertFreshDesignAccess(token, user.id, scope, 'write'),
    read: async (scope) => { await assertFreshDesignAccess(token, user.id, scope, 'read') },
    designer: async (scope) => { if (await assertFreshDesignAccess(token, user.id, scope, 'write') !== 'designer') throw new DesignModuleError('DESIGNER_REQUIRED') },
    publisher: scope => assertFreshDesignPublisher(token, user.id, scope)
  }
  return { env, authority }
}
export { readBoundedJson }
export function designLibraryHttpError(error: unknown): never {
  if (error && typeof error === 'object' && 'code' in error && error.code === '55000' && 'constraint' in error && DESIGN_REVISION_CONSTRAINTS.has(String(error.constraint))) rethrowLegacyDesignConflict(error)
  if (error instanceof ZodError) throw createError({ statusCode: 400, statusMessage: 'invalid_library_request' })
  if (error instanceof EmailDesignError) throw createError({ statusCode: error.code === 'LIMIT_EXCEEDED' ? 413 : ['EDIT_FORBIDDEN', 'POLICY_CHANGE_FORBIDDEN'].includes(error.code) ? 403 : 400, statusMessage: error.code })
  if (error instanceof DesignModuleError || error instanceof DesignReadError || error instanceof DesignRevisionError) throw createError({ statusCode: error.code === 'NOT_FOUND' ? 404 : ['DESIGNER_REQUIRED', 'PUBLISHER_REQUIRED'].includes(error.code) ? 403 : error.code.includes('STORAGE_UNAVAILABLE') ? 503 : 409, statusMessage: error.code })
  if (error && typeof error === 'object' && 'statusCode' in error) throw error
  // No automatic retry after an unknown write. Client retains original payload.
  throw createError({ statusCode: 503, statusMessage: 'design_library_outcome_unknown' })
}

/** Staff campaign content/selection uses existing fresh scoped content grants;
 * selecting an authorized library revision does not grant structural publishing. */
export async function designCampaignSession(event: H3Event, librarySelection = false) {
  setHeader(event, 'cache-control', 'private, no-store')
  const env = event.context.cloudflare?.env ?? {}
  if (env.FIGFLOW_EDM_DRAFT_SAVES_ENABLED !== 'true' || (librarySelection && env.FIGFLOW_EDM_LIBRARY_ENABLED !== 'true')) throw createError({ statusCode: 404, statusMessage: 'not_found' })
  assertDesignMutationRequest(event, env.FIGFLOW_EDM_APP_ORIGIN)
  const authorization = getHeader(event, 'authorization')
  const token = getCookie(event, 'auth_token') || getCookie(event, 'auth_token_client') || (authorization?.startsWith('Bearer ') ? authorization.slice(7) : null)
  const user = token ? await validateSession(token) : null
  if (!token || !user) throw createError({ statusCode: 401, statusMessage: 'design_session_invalid' })
  return { env, authority: { actorId: user.id,
    read: async (scope: string | null) => { await assertFreshDesignAccess(token, user.id, scope, 'read') },
    write: async (scope: string | null) => { await assertFreshDesignAccess(token, user.id, scope, 'write') } } }
}
