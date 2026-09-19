import { createError, type H3Event } from 'h3'
import { pageStudioAuthorityOwnerJoin, pageStudioEditorEntitlementJoin } from './authoritySql'
import type { PageStudioContentActor } from './businessContent'
import type { PageStudioControlQueryClient, PageStudioControlScope } from './controlStore'
import { bindPageStudioLoginSession, resolvePageStudioLoginSession, type PageStudioLoginSession } from './loginSessions'

/** Caller holds its site FOR NO KEY UPDATE before taking native/login locks.
 * Return a wall-clock recheck to run before every successful transaction return. */
export async function lockPageStudioHistoryAuthority(
  db: PageStudioControlQueryClient,
  event: H3Event,
  actor: PageStudioContentActor,
  scope: PageStudioControlScope
): Promise<() => Promise<void>> {
  let login: PageStudioLoginSession
  try {
    login = await resolvePageStudioLoginSession(db, event, actor.role, actor.actorId)
    await bindPageStudioLoginSession(db, login)
  } catch (error) {
    if ((error as { statusCode?: number })?.statusCode === 401) {
      throw createError({ statusCode: 401, statusMessage: 'Sign in again before changing draft history' })
    }
    throw createError({ statusCode: 503, statusMessage: 'Draft history authority unavailable' })
  }
  const agency = actor.role === 'agency'
  const ownerJoin = pageStudioAuthorityOwnerJoin(agency, 'history', 'clock_timestamp()')
  const recheck = async () => {
    let allowed: boolean
    try {
      const result = await db.query(`SELECT login.token_hash FROM page_studio_login_sessions login
        JOIN page_studio_sites site ON site.tenant_id=$4 AND site.client_id=$5 AND site.id=$6
          AND site.status IN ('draft', 'active')
        ${pageStudioEditorEntitlementJoin('clock_timestamp()')}
        ${ownerJoin}
        WHERE login.role=$1 AND login.token_hash=$2 AND login.user_id=$3
          AND login.revoked_at IS NULL AND login.expires_at > clock_timestamp()
        FOR SHARE`, [actor.role, login.tokenHash, actor.actorId, scope.tenantId, scope.clientId, scope.siteId])
      allowed = result.rows.length > 0
    } catch {
      throw createError({ statusCode: 503, statusMessage: 'Draft history authority unavailable' })
    }
    if (!allowed) throw createError({ statusCode: 403, statusMessage: 'Draft history access denied', data: { code: 'HISTORY_ACCESS_DENIED' } })
  }
  await recheck()
  return recheck
}
