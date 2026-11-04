import { createError, getCookie, getHeader, type H3Event } from 'h3'
import { assertFreshDesignPublisher } from './designAccess'

/** Legacy module mutations share the canonical publication authority. An old
 * mutable row is a compatibility format, never a weaker publisher role. */
export async function assertFreshLegacyModulePublisher(event: H3Event, actorId: string, storedScope: string | null) {
  const authorization = getHeader(event, 'authorization')
  const token = getCookie(event, 'auth_token') || getCookie(event, 'auth_token_client') || (authorization?.startsWith('Bearer ') ? authorization.slice(7) : null)
  if (!token) throw createError({ statusCode: 401, statusMessage: 'design_session_invalid' })
  await assertFreshDesignPublisher(token, actorId, storedScope)
}
