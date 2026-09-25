import { withPageStudioPublishAuthority, type PageStudioPublishPrincipal } from './publishAuthority'
import type { PageStudioPublishingScope } from './publishing'
import type { IssuedPageStudioSession, PageStudioSessionClaims } from './sessions'
import { PageStudioPublishingError } from './publishingError'

/** Review-only grant: no workspace, source-editing or AI capability is issued.
 * It is bound to the original native login, checked again on every preview read.
 * Signing occurs outside SQL; only a successfully persisted grant is returned. */
export async function issueAstroCandidateSession(
  scopeInput: PageStudioPublishingScope,
  principalInput: PageStudioPublishPrincipal,
  dependencies: NonNullable<Parameters<typeof withPageStudioPublishAuthority>[3]> & {
    signToken(claims: PageStudioSessionClaims): Promise<string>
  }
): Promise<IssuedPageStudioSession> {
  const scope = structuredClone(scopeInput), principal = structuredClone(principalInput)
  const issuedAt = Math.floor(Date.now() / 1000)
  const claims: PageStudioSessionClaims = { ...scope, userId: principal.actorId, role: 'agency', nonce: crypto.randomUUID(),
    issuedAt, expiresAt: Math.min(issuedAt + 300, Math.floor(principal.login.expiresAt.getTime() / 1000)), capabilities: ['workspace:preview'] }
  const token = await dependencies.signToken(structuredClone(claims))
  return withPageStudioPublishAuthority(scope, principal, async (db) => {
    if (claims.expiresAt <= Date.now() / 1000) {
      throw new PageStudioPublishingError('PUBLISH_AUTHORITY_DENIED', 403, 'The review session expired before it could be issued')
    }
    await db.query(`INSERT INTO page_studio_sessions(nonce,tenant_id,client_id,site_id,user_id,role,
      capabilities,issued_at,expires_at,login_session_hash)
      VALUES($1,$2,$3,$4,$5,'agency',$6::jsonb,to_timestamp($7),to_timestamp($8),$9)`,
    [claims.nonce, scope.tenantId, scope.clientId, scope.siteId, principal.actorId, JSON.stringify(claims.capabilities),
      claims.issuedAt, claims.expiresAt, principal.login.tokenHash])
    await db.query(`INSERT INTO page_studio_audit_events(tenant_id,client_id,site_id,actor_id,actor_role,action,
      resource_type,resource_id,metadata) VALUES($1,$2,$3,$4,'agency','session.issued','session',$5,$6::jsonb)`,
    [scope.tenantId, scope.clientId, scope.siteId, principal.actorId, claims.nonce,
      JSON.stringify({ capabilities: claims.capabilities, expiresAt: claims.expiresAt })])
    return { token, sessionId: claims.nonce, capabilities: claims.capabilities, expiresAt: claims.expiresAt }
  }, dependencies)
}
