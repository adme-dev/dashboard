import type { H3Event } from 'h3'
import { transactionWithoutRetry } from '~~/server/utils/db'
import type { AgencyPageStudioAccess } from './access'
import { bindPageStudioLoginSession, resolvePageStudioLoginSession } from './loginSessions'
import type { PageStudioPublishPrincipal } from './publishAuthority'
import { PageStudioPublishingError } from './publishingError'

/** Call only with server-resolved PAGE_STUDIO_PUBLISH access, before remote work.
 * Subsequent SQL must recheck this exact login, never a replacement credential. */
export async function preparePageStudioPublishPrincipal(event: H3Event, access: AgencyPageStudioAccess): Promise<PageStudioPublishPrincipal> {
  const actorId = access.user.id, tenantId = access.tenantId
  const login = await transactionWithoutRetry(async (db) => {
    const current = await resolvePageStudioLoginSession(db, event, 'agency', actorId)
    await bindPageStudioLoginSession(db, current)
    return current
  })
  return { actorId, tenantId, login }
}

/** Retain the persisted portal login's original timestamps. A later resolution
 * produces a new issuedAt, while binding deliberately preserves the first row. */
export async function preparePortalPageStudioPublishPrincipal(
  event: H3Event,
  access: { tenantId: string, user: { id: string } }
): Promise<PageStudioPublishPrincipal> {
  const actorId = access.user.id, tenantId = access.tenantId
  const login = await transactionWithoutRetry(async (db) => {
    const current = await resolvePageStudioLoginSession(db, event, 'client', actorId)
    await bindPageStudioLoginSession(db, current)
    const retained = (await db.query<{ issued_at: Date, expires_at: Date }>(`
      SELECT issued_at, expires_at FROM page_studio_login_sessions
      WHERE role=$1 AND token_hash=$2 AND user_id=$3 AND revoked_at IS NULL
        AND issued_at<=clock_timestamp() AND expires_at>clock_timestamp()
      FOR SHARE`, ['client', current.tokenHash, actorId])).rows[0]
    if (!retained) throw new PageStudioPublishingError('PUBLISH_AUTHORITY_DENIED', 403, 'Current publishing access is required')
    return { ...current, issuedAt: new Date(retained.issued_at), expiresAt: new Date(retained.expires_at) }
  })
  return { actorId, tenantId, login }
}
