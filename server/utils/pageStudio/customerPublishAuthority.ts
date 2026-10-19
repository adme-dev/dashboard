import { z } from 'zod'
import { transactionWithoutRetry } from '~~/server/utils/db'
import { digestPortalSessionToken } from '~~/server/utils/portalSession'
import type { PageStudioPublishingQueryClient, PageStudioPublishingScope } from './publishing'
import { PageStudioPublishingError } from './publishingError'

const Id = z.string().uuid()
const Scope = z.object({ tenantId: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/), clientId: Id, siteId: Id }).strict()
const Principal = z.object({
  kind: z.literal('customer'), identityId: Id, accountId: Id, workspaceId: Id,
  tokenHash: z.string().regex(/^[a-f0-9]{64}$/)
}).strict()
export type CustomerPublishPrincipal = z.infer<typeof Principal>
type RunTransaction = <T>(work: (db: PageStudioPublishingQueryClient) => Promise<T>) => Promise<T>
interface Dependencies { runTransaction?: RunTransaction }
const denied = () => new PageStudioPublishingError('PUBLISH_AUTHORITY_DENIED', 403, 'Current publishing access is required')
const defaultTransaction: RunTransaction = work => transactionWithoutRetry(db => work(db))

/** SQL-only boundary for standalone owners. It never grants a plan or converts
 * a preview entitlement. Each reservation/completion/activation must call this
 * again using the original principal; remote work belongs between transactions.
 * Artifact approval, delivery mode and domain health remain separate checks. */
export async function withCustomerPublishAuthority<T>(
  scopeInput: PageStudioPublishingScope, principalInput: CustomerPublishPrincipal,
  work: (db: PageStudioPublishingQueryClient) => Promise<T>, dependencies: Dependencies = {}
): Promise<T> {
  return withCustomerAuthority(scopeInput, principalInput, work, dependencies, 'write')
}

/** Review delivery uses compatible read locks so concurrent document/assets
 * do not contend with each other. Publishing callers retain exclusive locks. */
export function withCustomerPreviewAuthority<T>(
  scope: PageStudioPublishingScope, principal: CustomerPublishPrincipal,
  work: (db: PageStudioPublishingQueryClient) => Promise<T>, dependencies: Dependencies = {}
): Promise<T> {
  return withCustomerAuthority(scope, principal, work, dependencies, 'read')
}

async function withCustomerAuthority<T>(scopeInput: PageStudioPublishingScope, principalInput: CustomerPublishPrincipal,
  work: (db: PageStudioPublishingQueryClient) => Promise<T>, dependencies: Dependencies, mode: 'read' | 'write'): Promise<T> {
  const scope = Scope.safeParse(scopeInput), principal = Principal.safeParse(principalInput)
  if (!scope.success || !principal.success) throw denied()
  // Copy primitives before awaiting: callbacks cannot substitute later authority.
  const params = [scope.data.tenantId, scope.data.clientId, scope.data.siteId,
    principal.data.identityId, principal.data.accountId, principal.data.workspaceId, principal.data.tokenHash]
  try {
    return await (dependencies.runTransaction ?? defaultTransaction)(async (db) => {
      const check = async () => {
        const result = await db.query(`SELECT site.id
          FROM page_studio_customer_sessions session
          JOIN page_studio_customer_accounts account ON account.id=session.account_id
          JOIN page_studio_customer_identities identity ON identity.id=account.identity_id
          JOIN page_studio_workspace_memberships membership ON membership.identity_id=identity.id
          JOIN page_studio_customer_workspaces workspace ON workspace.id=membership.workspace_id
          JOIN page_studio_business_owners owner ON owner.workspace_id=workspace.id
          JOIN page_studio_sites site ON site.client_id=owner.id
          JOIN page_studio_entitlements entitlement ON entitlement.id=site.entitlement_id
            AND entitlement.client_id=site.client_id AND entitlement.tenant_id=site.tenant_id
          WHERE site.tenant_id=$1 AND site.client_id=$2 AND site.id=$3
            AND identity.id=$4 AND account.id=$5 AND workspace.id=$6 AND session.token_hash=$7
            AND session.revoked_at IS NULL AND session.created_at<=clock_timestamp()
            AND session.expires_at>clock_timestamp()
            AND account.status='active' AND identity.status='active'
            AND identity.issuer='studio' AND identity.subject=account.id::text
            AND identity.portal_user_id IS NULL AND identity.verified_at<=clock_timestamp()
            AND workspace.status='active' AND owner.agency_client_id IS NULL
            AND membership.role IN ('owner','manager') AND membership.revoked_at IS NULL
            AND (membership.expires_at IS NULL OR membership.expires_at>clock_timestamp())
            AND NOT EXISTS (SELECT 1 FROM page_studio_workspace_client_bindings legacy WHERE legacy.workspace_id=workspace.id)
            AND site.status IN ('draft','active')
            AND entitlement.status='active' AND entitlement.plan_key<>'customer_preview_v1'
            AND entitlement.effective_from<=clock_timestamp()
            AND (entitlement.effective_until IS NULL OR entitlement.effective_until>clock_timestamp())
            AND entitlement.active_site_limit>0 AND entitlement.custom_domain_limit>0
            AND entitlement.plan_metadata->'publishingEnabled'='true'::jsonb
          FOR SHARE OF session,account,identity,membership,workspace,owner,entitlement NOWAIT`, params)
        if (result.rows.length !== 1) throw denied()
      }
      // Match native login/workspace admission before locking the site's state.
      // NOWAIT refuses an in-flight revocation rather than waiting on stale data.
      await check()
      if ((await db.query(`SELECT id FROM page_studio_sites
        WHERE tenant_id=$1 AND client_id=$2 AND id=$3 ${mode === 'read' ? 'FOR SHARE' : 'FOR NO KEY UPDATE'} NOWAIT`, params.slice(0, 3))).rows.length !== 1) throw denied()
      await check()
      const result = await work(db)
      await check()
      return result
    })
  } catch (error) {
    if ((error as { code?: string })?.code === '55P03') {
      throw new PageStudioPublishingError('PUBLISH_AUTHORITY_BUSY', 503, 'Publishing access is changing. Retry the same operation.')
    }
    throw error
  }
}

/** Capture server-derived ownership and the exact native session before any
 * remote build. Internal only: this principal contains a login hash and must
 * never be returned in an HTTP response, persisted in an audit or logged. */
export async function prepareCustomerPublishPrincipal(sessionToken: unknown, siteId: unknown, dependencies: Dependencies = {}) {
  const input = z.object({ sessionToken: z.string().regex(/^[A-Za-z0-9_-]{64}$/), siteId: Id }).safeParse({ sessionToken, siteId })
  if (!input.success) throw denied()
  const tokenHash = await digestPortalSessionToken(input.data.sessionToken)
  return (dependencies.runTransaction ?? defaultTransaction)(async (db) => {
    const rows = (await db.query<{ tenant_id: string, client_id: string, workspace_id: string, account_id: string, identity_id: string }>(`
      SELECT site.tenant_id,site.client_id,owner.workspace_id,account.id AS account_id,account.identity_id
      FROM page_studio_sites site
      JOIN page_studio_business_owners owner ON owner.id=site.client_id
      JOIN page_studio_customer_sessions session ON session.token_hash=$1
      JOIN page_studio_customer_accounts account ON account.id=session.account_id
      WHERE site.id=$2`, [tokenHash, input.data.siteId])).rows
    if (rows.length !== 1) throw denied()
    const row = rows[0]!
    const scope = { tenantId: row.tenant_id, clientId: row.client_id, siteId: input.data.siteId }
    const principal: CustomerPublishPrincipal = { kind: 'customer', identityId: row.identity_id,
      accountId: row.account_id, workspaceId: row.workspace_id, tokenHash }
    return withCustomerPublishAuthority(scope, principal, async () => ({ scope, principal }), { runTransaction: work => work(db) })
  })
}
