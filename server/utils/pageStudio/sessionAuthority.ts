import { queryOneFresh } from '~~/server/utils/db'
import {
  PageStudioSessionCapabilitySchema, PageStudioSessionClaimsSchema,
  type PageStudioSessionClaims, type PageStudioSessionQueryOne
} from '~~/server/utils/pageStudio/sessions'

export class PageStudioSessionAuthorityError extends Error {
  constructor(readonly code: 'SESSION_AUTHORITY_DENIED' | 'SESSION_AUTHORITY_UNAVAILABLE', readonly statusCode: number) {
    super(statusCode === 403 ? 'Page Studio session authority denied' : 'Page Studio session authority unavailable')
    this.name = 'PageStudioSessionAuthorityError'
  }
}

/** Fresh request admission, not a reusable grant or a transaction commit fence. */
export async function assertPageStudioSessionAuthority(
  claims: PageStudioSessionClaims,
  requiredCapability: string,
  dependencies: { queryOneFresh?: PageStudioSessionQueryOne } = {}
): Promise<void> {
  const parsed = PageStudioSessionClaimsSchema.safeParse(claims)
  const capability = PageStudioSessionCapabilitySchema.safeParse(requiredCapability)
  if (!parsed.success || !capability.success || !parsed.data.capabilities.includes(capability.data)
    || (capability.data === 'source:edit' && parsed.data.role !== 'agency')) {
    throw new PageStudioSessionAuthorityError('SESSION_AUTHORITY_DENIED', 403)
  }
  const agency = claims.role === 'agency'
  const ownerJoin = agency
    ? `JOIN team_members owner ON owner.id::text = session.user_id AND owner.is_active = TRUE
         AND owner.user_role NOT IN ('viewer', 'guest')
       JOIN custom_roles staff_role ON
         ((owner.custom_role_id IS NOT NULL AND staff_role.id = owner.custom_role_id)
          OR (owner.custom_role_id IS NULL AND staff_role.slug = owner.user_role::text AND staff_role.is_system = TRUE))
         AND staff_role.is_read_only = FALSE
       JOIN role_permission_groups permission ON permission.role_id = staff_role.id
         AND permission.permission_group = 'PAGE_STUDIO_EDIT'`
    : `JOIN client_users owner ON owner.id::text = session.user_id AND owner.client_id = site.client_id
         AND owner.status = 'active'
       JOIN page_studio_site_memberships membership ON membership.tenant_id = site.tenant_id
         AND membership.client_id = site.client_id AND membership.site_id = site.id
         AND membership.user_id = owner.id AND membership.role = 'editor'`
  const row = await (dependencies.queryOneFresh ?? queryOneFresh)<{ nonce: string }>(`
    SELECT session.nonce
      FROM page_studio_sessions session
      JOIN page_studio_sites site ON site.tenant_id = session.tenant_id
        AND site.client_id = session.client_id AND site.id = session.site_id
        AND site.status IN ('draft', 'active')
      JOIN agency_clients client ON client.id = site.client_id AND client.is_active = TRUE
      JOIN page_studio_entitlements entitlement ON entitlement.tenant_id = site.tenant_id
        AND entitlement.client_id = site.client_id AND entitlement.id = site.entitlement_id
        AND entitlement.status IN ('trial', 'active')
        AND entitlement.effective_from <= NOW()
        AND (entitlement.effective_until IS NULL OR entitlement.effective_until > NOW())
      ${ownerJoin}
     WHERE session.nonce = $1 AND session.tenant_id = $2
       AND session.client_id::text = $3 AND session.site_id::text = $4
       AND session.user_id = $5 AND session.role = $6
       AND session.capabilities = $7::jsonb
       AND session.issued_at = to_timestamp($8) AND session.expires_at = to_timestamp($9)
       AND session.revoked_at IS NULL AND session.expires_at > NOW()
       AND ($10 <> 'model:invoke' OR entitlement.monthly_ai_operation_limit > 0)
     LIMIT 1`, [claims.nonce, claims.tenantId, claims.clientId, claims.siteId,
    claims.userId, claims.role, JSON.stringify(claims.capabilities), claims.issuedAt, claims.expiresAt, capability.data]
  ).catch(() => { throw new PageStudioSessionAuthorityError('SESSION_AUTHORITY_UNAVAILABLE', 503) })
  if (!row || row.nonce !== claims.nonce) throw new PageStudioSessionAuthorityError('SESSION_AUTHORITY_DENIED', 403)
}
