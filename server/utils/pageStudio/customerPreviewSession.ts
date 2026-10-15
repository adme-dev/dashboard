import { z } from 'zod'
import { transactionWithoutRetry } from '~~/server/utils/db'
import { withAstroPublishAuthority } from './astroPublishAuthority'
import { withCustomerPreviewAuthority, type CustomerPublishPrincipal } from './customerPublishAuthority'
import { CustomerPreviewClaimsSchema, type CustomerPreviewClaims } from './customerPreviewToken'
import { readApprovedPreviewAuthority } from './builds'
import { PageStudioPublishingError } from './publishingError'
import { mapPageStudioReleasePointer, type PageStudioBuildPointerRow } from './releasePointers'
import type { PageStudioPublishingQueryClient, PageStudioPublishingScope } from './publishing'

type RunTransaction = <T>(work: (db: PageStudioPublishingQueryClient) => Promise<T>) => Promise<T>
interface Dependencies { runTransaction?: RunTransaction }
const defaultTransaction: RunTransaction = work => transactionWithoutRetry(db => work(db))
const denied = () => new PageStudioPublishingError('PUBLISH_AUTHORITY_DENIED', 403, 'Current private preview access is required')
const Target = z.object({
  scope: z.object({ tenantId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/), clientId: z.uuid(), siteId: z.uuid() }).strict(),
  hostname: CustomerPreviewClaimsSchema.shape.hostname, releaseId: z.uuid()
}).strict()

/** Read only the exact retained preview, never a live pointer or runtime draft. */
async function retainedPreview(db: PageStudioPublishingQueryClient, scope: PageStudioPublishingScope, hostname: string, releaseId: string) {
  const row = (await db.query<PageStudioBuildPointerRow & { release_id: string, environment: 'preview', astro_approval_id: string }>(`
    SELECT build.artifact_prefix,build.renderer,build.version_id AS build_version_id,
      build.build_identity,build.build_identity_digest,build.compiler_toolchain,
      build.astro_release_receipt,build.validation_report_key,build.id AS build_id,
      build.release_manifest_digest AS manifest_digest,build.release_manifest_key AS manifest_key,
      release.id AS release_id,release.environment,build.version_digest,build.astro_approval_id
    FROM page_studio_release_pointers pointer
    JOIN page_studio_sites site ON site.tenant_id=pointer.tenant_id AND site.client_id=pointer.client_id
      AND site.id=pointer.site_id AND site.delivery_mode='static'
    JOIN page_studio_releases release ON release.tenant_id=pointer.tenant_id AND release.client_id=pointer.client_id
      AND release.site_id=pointer.site_id AND release.id=pointer.active_release_id
      AND release.environment='preview' AND release.normalized_hostname=pointer.normalized_hostname
    JOIN page_studio_builds build ON build.tenant_id=release.tenant_id AND build.client_id=release.client_id
      AND build.site_id=release.site_id AND build.id=release.build_id AND build.state='succeeded'
      AND build.renderer='astro' AND build.build_identity->>'environment'='production'
      AND build.build_identity->'source'->>'kind'='approved-version'
    WHERE pointer.tenant_id=$1 AND pointer.client_id=$2 AND pointer.site_id=$3
      AND pointer.environment='preview' AND pointer.normalized_hostname=$4 AND release.id=$5
    FOR SHARE OF pointer,release,build NOWAIT`, [scope.tenantId, scope.clientId, scope.siteId, hostname, releaseId])).rows[0]
  if (!row?.build_version_id) throw denied()
  const approved = await readApprovedPreviewAuthority(db, { tenantId: scope.tenantId, siteId: scope.siteId, versionId: row.build_version_id })
  if (approved.client_id !== scope.clientId || approved.digest !== row.version_digest || approved.approval_id !== row.astro_approval_id) throw denied()
  return { hostname, release: { ...await mapPageStudioReleasePointer(scope, row), environment: 'preview' as const } }
}

/** Sign outside SQL, then persist only after rechecking login, plan and target. */
export async function issueCustomerPreviewSession(raw: unknown, principalInput: CustomerPublishPrincipal,
  dependencies: Dependencies & { signToken(claims: CustomerPreviewClaims): Promise<string> }) {
  const input = Target.parse(raw), principal = structuredClone(principalInput)
  const claims = await withAstroPublishAuthority(input.scope, principal, async (db) => {
    await retainedPreview(db, input.scope, input.hostname, input.releaseId)
    const login = (await db.query<{ expires_at: Date }>('SELECT expires_at FROM page_studio_customer_sessions WHERE token_hash=$1', [principal.tokenHash])).rows[0]
    const issuedAt = Math.floor(Date.now() / 1000)
    return CustomerPreviewClaimsSchema.parse({ ...input.scope, role: 'customer', purpose: 'release-preview', environment: 'production',
      hostname: input.hostname, releaseId: input.releaseId, nonce: crypto.randomUUID(), userId: principal.identityId,
      workspaceId: principal.workspaceId, issuedAt, expiresAt: Math.min(issuedAt + 300, Math.floor(new Date(login!.expires_at).getTime() / 1000)) })
  }, dependencies)
  const token = await dependencies.signToken(structuredClone(claims))
  return withAstroPublishAuthority(input.scope, principal, async (db) => {
    await retainedPreview(db, input.scope, input.hostname, input.releaseId)
    if (claims.expiresAt <= Date.now() / 1000) throw denied()
    await db.query(`INSERT INTO page_studio_customer_preview_sessions
      (nonce,tenant_id,client_id,site_id,identity_id,account_id,workspace_id,login_session_hash,release_id,claims,issued_at,expires_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,to_timestamp($11),to_timestamp($12))`,
    [claims.nonce, input.scope.tenantId, input.scope.clientId, input.scope.siteId, principal.identityId, principal.accountId,
      principal.workspaceId, principal.tokenHash, input.releaseId, JSON.stringify(claims), claims.issuedAt, claims.expiresAt])
    await db.query(`INSERT INTO page_studio_audit_events(tenant_id,client_id,site_id,actor_id,actor_role,action,resource_type,resource_id,metadata)
      VALUES($1,$2,$3,$4,'customer','customer.preview_session_issued','session',$5,$6::jsonb)`,
    [input.scope.tenantId, input.scope.clientId, input.scope.siteId, principal.identityId, claims.nonce,
      JSON.stringify({ releaseId: input.releaseId, hostname: input.hostname, expiresAt: claims.expiresAt })])
    return { token, sessionId: claims.nonce, expiresAt: claims.expiresAt }
  }, dependencies)
}

/** Claims must be signature-verified by delivery first. Original native login
 * stays server-side and is checked on every request; no portal alias is made. */
export async function authorizeCustomerPreviewSession(claimsInput: CustomerPreviewClaims, hostname: string, dependencies: Dependencies = {}) {
  const claims = CustomerPreviewClaimsSchema.parse(claimsInput)
  if (claims.hostname !== hostname) return null
  const scope = { tenantId: claims.tenantId, clientId: claims.clientId, siteId: claims.siteId }
  try {
    return await (dependencies.runTransaction ?? defaultTransaction)(async (db) => {
      const readGrant = async () => (await db.query<{ account_id: string, login_session_hash: string }>(`
        SELECT account_id,login_session_hash FROM page_studio_customer_preview_sessions
        WHERE nonce=$1 AND tenant_id=$2 AND client_id=$3 AND site_id=$4 AND identity_id=$5 AND workspace_id=$6
          AND release_id=$7 AND claims=$8::jsonb AND revoked_at IS NULL
          AND issued_at=to_timestamp($9) AND expires_at=to_timestamp($10)
          AND issued_at<=clock_timestamp() AND expires_at>clock_timestamp()`,
      [claims.nonce, scope.tenantId, scope.clientId, scope.siteId, claims.userId, claims.workspaceId,
        claims.releaseId, JSON.stringify(claims), claims.issuedAt, claims.expiresAt])).rows[0]
      const grant = await readGrant()
      if (!grant) return null
      const principal: CustomerPublishPrincipal = { kind: 'customer', identityId: claims.userId,
        accountId: grant.account_id, workspaceId: claims.workspaceId, tokenHash: grant.login_session_hash }
      return withCustomerPreviewAuthority(scope, principal, async () => {
        // Parent login/site locks precede the child ledger lock, matching logout.
        const locked = (await db.query('SELECT nonce FROM page_studio_customer_preview_sessions WHERE nonce=$1 FOR SHARE NOWAIT', [claims.nonce])).rows[0]
        if (!locked || !await readGrant()) return null
        const preview = await retainedPreview(db, scope, hostname, claims.releaseId)
        return await readGrant() ? preview : null
      }, { runTransaction: work => work(db) })
    })
  } catch (error) {
    if (['PUBLISH_AUTHORITY_DENIED', 'SITE_NOT_PUBLISHABLE', 'BUILD_NOT_APPROVED'].includes((error as { code?: string }).code ?? '')) return null
    throw error
  }
}
