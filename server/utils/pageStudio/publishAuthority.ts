import { z } from 'zod'
import { transactionWithoutRetry } from '~~/server/utils/db'
import { pageStudioAuthorityOwnerJoin, pageStudioEditorEntitlementJoin } from './authoritySql'
import type { PageStudioLoginSession } from './loginSessions'
import type { PageStudioPublishingQueryClient, PageStudioPublishingScope } from './publishing'
import { PageStudioPublishingError } from './publishingError'

export interface PageStudioPublishPrincipal {
  actorId: string
  tenantId: string
  login: PageStudioLoginSession
}

type RunTransaction = <T>(work: (db: PageStudioPublishingQueryClient) => Promise<T>) => Promise<T>
const tenantId = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/)
const Scope = z.object({ tenantId, clientId: z.string().uuid(), siteId: z.string().uuid() })
const Principal = z.object({
  actorId: z.string().uuid(), tenantId,
  login: z.object({ role: z.literal('agency'), userId: z.string().uuid(), tokenHash: z.string().regex(/^[a-f0-9]{64}$/), issuedAt: z.date(), expiresAt: z.date() })
})
const denied = () => new PageStudioPublishingError('PUBLISH_AUTHORITY_DENIED', 403, 'Current publishing access is required')

/** SQL-only publication boundary. Capture the original native login before remote
 * work, then use this boundary for reservation, completion and activation. Never
 * hold these locks across Worker calls or other remote operations. */
export async function withPageStudioPublishAuthority<T>(
  scopeInput: PageStudioPublishingScope,
  principalInput: PageStudioPublishPrincipal,
  work: (db: PageStudioPublishingQueryClient) => Promise<T>,
  dependencies: { runTransaction?: RunTransaction } = {}
): Promise<T> {
  const parsedScope = Scope.safeParse(scopeInput), parsedPrincipal = Principal.safeParse(principalInput)
  if (!parsedScope.success || !parsedPrincipal.success) throw denied()
  const scope = parsedScope.data, principal = parsedPrincipal.data
  if (principal.tenantId !== scope.tenantId || principal.actorId !== principal.login.userId
    || principal.login.issuedAt >= principal.login.expiresAt) throw denied()
  // Retain primitive values before the first await, including Date instances
  // supplied by callers. The callback cannot change the authority being checked.
  const params = [scope.tenantId, scope.clientId, scope.siteId, principal.actorId,
    principal.login.tokenHash, principal.login.issuedAt.toISOString(), principal.login.expiresAt.toISOString()]
  const run: RunTransaction = dependencies.runTransaction ?? (callback => transactionWithoutRetry(db => callback(db)))
  try {
    return await run(async (db) => {
      // Match publication and CMS lock ordering; NOWAIT avoids waiting on a
      // revocation while retaining an earlier statement's time predicates.
      if ((await db.query(`SELECT id FROM page_studio_sites
        WHERE tenant_id=$1 AND client_id=$2 AND id=$3
        FOR NO KEY UPDATE NOWAIT`, params.slice(0, 3))).rows.length !== 1) throw denied()
      const check = async () => {
        const rows = (await db.query(`SELECT site.id FROM page_studio_sites site
          JOIN page_studio_login_sessions login ON login.role='agency' AND login.token_hash=$5
            AND login.user_id=$4 AND login.issued_at=$6::timestamptz AND login.expires_at=$7::timestamptz
            AND login.revoked_at IS NULL AND login.issued_at<=clock_timestamp() AND login.expires_at>clock_timestamp()
          ${pageStudioAuthorityOwnerJoin(true, 'history', 'clock_timestamp()', 'PAGE_STUDIO_PUBLISH')}
          ${pageStudioEditorEntitlementJoin('clock_timestamp()')}
          WHERE site.tenant_id=$1 AND site.client_id=$2 AND site.id=$3 AND site.status IN ('draft','active')
          FOR SHARE OF login,owner,staff_role,permission,client,entitlement NOWAIT`, params)).rows
        if (rows.length !== 1) throw denied()
      }
      await check()
      const result = await work(db)
      await check()
      return result
    })
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === '55P03') {
      throw new PageStudioPublishingError('PUBLISH_AUTHORITY_BUSY', 503, 'Publishing access is changing. Retry the same operation.')
    }
    throw error
  }
}
