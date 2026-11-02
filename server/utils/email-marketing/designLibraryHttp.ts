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
    read: async (scope) => { await assertFreshDesignAccess(token, user.id, scope, 'read') },
    designer: async (scope) => { if (await assertFreshDesignAccess(token, user.id, scope, 'write') !== 'designer') throw new DesignModuleError('DESIGNER_REQUIRED') },
    publisher: scope => assertFreshDesignPublisher(token, user.id, scope)
  }
  return { env, authority }
}
export { readBoundedJson }
export function designLibraryHttpError(error: unknown): never {
  if (error instanceof ZodError) throw createError({ statusCode: 400, statusMessage: 'invalid_library_request' })
  if (error instanceof EmailDesignError) throw createError({ statusCode: error.code === 'LIMIT_EXCEEDED' ? 413 : ['EDIT_FORBIDDEN', 'POLICY_CHANGE_FORBIDDEN'].includes(error.code) ? 403 : 400, statusMessage: error.code })
  if (error instanceof DesignModuleError || error instanceof DesignReadError || error instanceof DesignRevisionError) throw createError({ statusCode: error.code === 'NOT_FOUND' ? 404 : ['DESIGNER_REQUIRED', 'PUBLISHER_REQUIRED'].includes(error.code) ? 403 : error.code.includes('STORAGE_UNAVAILABLE') ? 503 : 409, statusMessage: error.code })
  if (error && typeof error === 'object' && 'statusCode' in error) throw error
  // No automatic retry after an unknown write. Client retains original payload.
  throw createError({ statusCode: 503, statusMessage: 'design_library_outcome_unknown' })
}
