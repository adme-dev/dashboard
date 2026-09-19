import { pageStudioAuthorityOwnerJoin, pageStudioEditorEntitlementJoin } from './authoritySql'
import { queryOneFresh } from '~~/server/utils/db'
import {
  PageStudioSessionCapabilitySchema, PageStudioSessionClaimsSchema,
  type PageStudioSessionClaims, type PageStudioSessionQueryClient, type PageStudioSessionQueryOne
} from '~~/server/utils/pageStudio/sessions'

export class PageStudioSessionAuthorityError extends Error {
  constructor(readonly code: 'SESSION_AUTHORITY_DENIED' | 'SESSION_AUTHORITY_UNAVAILABLE', readonly statusCode: number) {
    super(statusCode === 403 ? 'Page Studio session authority denied' : 'Page Studio session authority unavailable')
    this.name = 'PageStudioSessionAuthorityError'
  }
}

/** Fresh admission. With a caller-owned transaction, lock all authority rows
 * until that transaction commits. The caller must lock its site FOR NO KEY UPDATE
 * first, then recheck immediately before returning (including idempotent replay). */
export async function assertPageStudioSessionAuthority(
  claims: PageStudioSessionClaims,
  requiredCapability: string,
  dependencies: { queryOneFresh?: PageStudioSessionQueryOne, transaction?: PageStudioSessionQueryClient } = {}
): Promise<void> {
  const parsed = PageStudioSessionClaimsSchema.safeParse(claims)
  const capability = PageStudioSessionCapabilitySchema.safeParse(requiredCapability)
  if (!parsed.success || !capability.success || !parsed.data.capabilities.includes(capability.data)
    || (capability.data === 'source:edit' && parsed.data.role !== 'agency')) {
    throw new PageStudioSessionAuthorityError('SESSION_AUTHORITY_DENIED', 403)
  }
  const agency = claims.role === 'agency'
  const readOne: PageStudioSessionQueryOne = async <T>(sql: string, params?: unknown[]): Promise<T | null> => {
    try {
      return dependencies.transaction
        ? (await dependencies.transaction.query<T>(sql, params)).rows[0] ?? null
        : await (dependencies.queryOneFresh ?? queryOneFresh)<T>(sql, params)
    } catch { throw new PageStudioSessionAuthorityError('SESSION_AUTHORITY_UNAVAILABLE', 503) }
  }
  if (dependencies.transaction) {
    // Match logout's native → login → child ordering. OF excludes the joined
    // child session here; a combined lock query does not guarantee lock order.
    const args = [claims.nonce, claims.userId, claims.role]
    if (!agency && !await readOne(`SELECT native_session.token_hash
      FROM client_sessions native_session JOIN page_studio_sessions session
        ON session.login_session_hash = native_session.token_hash
      WHERE session.nonce=$1 AND session.user_id=$2 AND session.role=$3
        AND native_session.client_user_id::text=$2 FOR SHARE OF native_session`, args)) {
      throw new PageStudioSessionAuthorityError('SESSION_AUTHORITY_DENIED', 403)
    }
    if (!await readOne(`SELECT login.token_hash FROM page_studio_login_sessions login
      JOIN page_studio_sessions session ON session.login_session_hash=login.token_hash AND session.role=login.role
      WHERE session.nonce=$1 AND session.user_id=$2 AND session.role=$3 AND login.user_id=$2
      FOR SHARE OF login`, args)) {
      throw new PageStudioSessionAuthorityError('SESSION_AUTHORITY_DENIED', 403)
    }
  }
  // NOW() freezes at BEGIN. A lock wait must not extend session/package expiry.
  const time = dependencies.transaction ? 'clock_timestamp()' : 'NOW()'
  const ownerJoin = pageStudioAuthorityOwnerJoin(agency, 'session', time)
  const row = await readOne<{ nonce: string }>(`
    SELECT session.nonce
      FROM page_studio_sessions session
      JOIN page_studio_login_sessions login ON login.role = session.role
        AND login.token_hash = session.login_session_hash AND login.user_id = session.user_id
        AND login.revoked_at IS NULL AND login.expires_at > ${time}
      JOIN page_studio_sites site ON site.tenant_id = session.tenant_id
        AND site.client_id = session.client_id AND site.id = session.site_id
        AND site.status IN ('draft', 'active')
      ${pageStudioEditorEntitlementJoin(time)}
        ${ownerJoin}
     WHERE session.nonce = $1 AND session.tenant_id = $2
       AND session.client_id::text = $3 AND session.site_id::text = $4
       AND session.user_id = $5 AND session.role = $6
       AND session.capabilities = $7::jsonb
       AND session.issued_at = to_timestamp($8) AND session.expires_at = to_timestamp($9)
       AND session.revoked_at IS NULL AND session.expires_at > ${time}
       AND ($10 <> 'model:invoke' OR entitlement.monthly_ai_operation_limit > 0)
     LIMIT 1${dependencies.transaction ? ' FOR SHARE' : ''}`, [claims.nonce, claims.tenantId, claims.clientId, claims.siteId,
    claims.userId, claims.role, JSON.stringify(claims.capabilities), claims.issuedAt, claims.expiresAt, capability.data]
  )
  if (!row || row.nonce !== claims.nonce) throw new PageStudioSessionAuthorityError('SESSION_AUTHORITY_DENIED', 403)
}
