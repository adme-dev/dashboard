import { createError, getCookie, getHeader, setHeader, type H3Event } from 'h3'
import { validateSession } from '~~/server/utils/auth'
import { assertFreshDesignAccess, assertFreshDesignPublisher } from './designAccess'
import { assertDesignMutationRequest } from './designRequest'
import type { ModuleAuthority } from './designModules'

/** Independent brand/policy admission; library and designer-return gates do not
 * implicitly turn this endpoint on. No browser role/scope claim is authority. */
export async function designBrandSession(event: H3Event, mutation: boolean) {
  setHeader(event, 'cache-control', 'private, no-store')
  const env = event.context.cloudflare?.env ?? {}
  if (env.FIGFLOW_EDM_DRAFT_SAVES_ENABLED !== 'true' || env.FIGFLOW_EDM_DESIGNER_ENABLED !== 'true' || env.FIGFLOW_EDM_BRAND_ENABLED !== 'true') throw createError({ statusCode: 404, statusMessage: 'not_found' })
  if (mutation) assertDesignMutationRequest(event, env.FIGFLOW_EDM_APP_ORIGIN)
  const authorization = getHeader(event, 'authorization')
  const token = getCookie(event, 'auth_token') || getCookie(event, 'auth_token_client') || (authorization?.startsWith('Bearer ') ? authorization.slice(7) : null)
  const user = token ? await validateSession(token) : null
  if (!token || !user) throw createError({ statusCode: 401, statusMessage: 'design_session_invalid' })
  const authority: ModuleAuthority = {
    actorId: user.id,
    read: async (scope) => { await assertFreshDesignAccess(token, user.id, scope, 'read') },
    designer: async (scope) => {
      if (await assertFreshDesignAccess(token, user.id, scope, 'write') !== 'designer') throw createError({ statusCode: 403, statusMessage: 'design_access_denied' })
    },
    // Existing fresh gate requires ADMIN or MANAGEMENT AND CREATIVE. This is
    // design policy management, not ordinary scoped designer permission.
    publisher: scope => assertFreshDesignPublisher(token, user.id, scope)
  }
  return { env, authority }
}
