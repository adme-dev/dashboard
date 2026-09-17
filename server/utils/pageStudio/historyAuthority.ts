import { createError, type H3Event } from 'h3'
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
  const ownerJoin = agency
    ? `JOIN team_members owner ON owner.id::text = login.user_id AND owner.is_active = TRUE
         AND owner.user_role NOT IN ('viewer', 'guest')
         AND (owner.sessions_invalidated_at IS NULL OR login.issued_at >= owner.sessions_invalidated_at)
       JOIN custom_roles staff_role ON
         ((owner.custom_role_id IS NOT NULL AND staff_role.id = owner.custom_role_id)
          OR (owner.custom_role_id IS NULL AND staff_role.slug = owner.user_role::text AND staff_role.is_system = TRUE))
         AND staff_role.is_read_only = FALSE
       JOIN role_permission_groups permission ON permission.role_id = staff_role.id
         AND permission.permission_group = 'PAGE_STUDIO_EDIT'`
    : `JOIN client_users owner ON owner.id::text = login.user_id AND owner.client_id = site.client_id
         AND owner.status = 'active'
       JOIN client_sessions native_session ON native_session.token_hash = login.token_hash
         AND native_session.client_user_id = owner.id AND native_session.expires_at > clock_timestamp()
       JOIN page_studio_site_memberships membership ON membership.tenant_id = site.tenant_id
         AND membership.client_id = site.client_id AND membership.site_id = site.id
         AND membership.user_id = owner.id AND membership.role = 'editor'`
  const recheck = async () => {
    let allowed: boolean
    try {
      const result = await db.query(`SELECT login.token_hash FROM page_studio_login_sessions login
        JOIN page_studio_sites site ON site.tenant_id=$4 AND site.client_id=$5 AND site.id=$6
          AND site.status IN ('draft', 'active')
        JOIN agency_clients client ON client.id=site.client_id AND client.is_active=TRUE
        JOIN page_studio_entitlements entitlement ON entitlement.tenant_id=site.tenant_id
          AND entitlement.client_id=site.client_id AND entitlement.id=site.entitlement_id
          AND entitlement.status IN ('trial', 'active')
          AND entitlement.effective_from <= clock_timestamp()
          AND (entitlement.effective_until IS NULL OR entitlement.effective_until > clock_timestamp())
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
