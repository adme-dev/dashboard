import type { H3Event } from 'h3'
import { transactionWithoutRetry } from '~~/server/utils/db'
import type { AgencyPageStudioAccess } from './access'
import { bindPageStudioLoginSession, resolvePageStudioLoginSession } from './loginSessions'
import type { PageStudioPublishPrincipal } from './publishAuthority'

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
