import { createError } from 'h3'
import { z } from 'zod'
import { transactionWithoutRetry } from '~~/server/utils/db'
import type { PageStudioQueryClient, RunPageStudioTransaction } from '~~/shared/pageStudio/controlTypes'

const Input = z.object({
  loginSessionHash: z.string().regex(/^[a-f0-9]{64}$/),
  siteId: z.string().uuid(),
  entitlementId: z.string().uuid()
}).strict()
const denied = () => createError({ statusCode: 403, statusMessage: 'Current customer authoring access is required' })
interface AuthorityRow {
  identity_id: string
  account_id: string
  workspace_id: string
  business_id: string
  tenant_id: string
  expires_at: Date | string
}
export interface CustomerProductionAuthoringAuthority {
  identityId: string
  accountId: string
  workspaceId: string
  entitlementId: string
  expiresAt: string
  scope: { tenantId: string, businessId: string, clientId: string, siteId: string, environment: 'production' }
}

/** SQL-only authority for native owners after an explicit publishing-plan grant.
 * This is not editor admission: callers still verify the immutable handoff,
 * configured environment and exact managed CMS storage before any read/save.
 * Never use it for provisioning, CMS adoption or publication. Call again around
 * each database operation; remote work belongs outside this transaction.
 * The original login and exact plan are pinned, so a replacement plan cannot
 * silently renew an existing editor session. No preview policy is rewritten.
 */
export async function withCustomerProductionAuthoringAuthority<T>(
  input: unknown,
  work: (db: PageStudioQueryClient, authority: CustomerProductionAuthoringAuthority) => Promise<T>,
  dependencies: { runTransaction?: RunPageStudioTransaction } = {}
): Promise<T> {
  const parsed = Input.safeParse(input)
  if (!parsed.success) throw denied()
  // Capture primitives before awaiting: callback/caller mutation cannot change
  // which original login, site or plan is checked at completion.
  const { loginSessionHash, siteId, entitlementId } = parsed.data
  const params = [loginSessionHash, siteId, entitlementId]
  try {
    return await (dependencies.runTransaction ?? transactionWithoutRetry)(async (db) => {
      const check = async (): Promise<CustomerProductionAuthoringAuthority> => {
        const rows = (await db.query<AuthorityRow>(`
          SELECT identity.id AS identity_id, account.id AS account_id,
            receipt.workspace_id, receipt.business_id, receipt.tenant_id,
            LEAST(session.expires_at,membership.expires_at,entitlement.effective_until) AS expires_at
          FROM page_studio_customer_sessions session
          JOIN page_studio_customer_accounts account ON account.id=session.account_id
          JOIN page_studio_customer_identities identity ON identity.id=account.identity_id
          JOIN page_studio_workspace_memberships membership ON membership.identity_id=identity.id
          JOIN page_studio_customer_workspaces workspace ON workspace.id=membership.workspace_id
          JOIN page_studio_business_owners owner ON owner.workspace_id=workspace.id
          JOIN page_studio_customer_site_requests receipt ON receipt.workspace_id=workspace.id AND receipt.business_id=owner.id
          JOIN page_studio_sites site ON site.id=receipt.site_id AND site.client_id=receipt.business_id AND site.tenant_id=receipt.tenant_id
          JOIN page_studio_entitlements entitlement ON entitlement.id=site.entitlement_id
            AND entitlement.client_id=site.client_id AND entitlement.tenant_id=site.tenant_id
          WHERE session.token_hash=$1 AND site.id=$2 AND entitlement.id=$3
            AND session.revoked_at IS NULL AND session.created_at<=clock_timestamp() AND session.expires_at>clock_timestamp()
            AND account.status='active' AND identity.status='active' AND identity.verified_at<=clock_timestamp()
            AND identity.issuer='studio' AND identity.subject=account.id::text AND identity.portal_user_id IS NULL
            AND workspace.status='active' AND owner.agency_client_id IS NULL
            AND receipt.tenant_id='studio-customer-' || owner.id::text
            AND membership.role='owner' AND membership.revoked_at IS NULL
            AND (membership.expires_at IS NULL OR membership.expires_at>clock_timestamp())
            AND NOT EXISTS (SELECT 1 FROM page_studio_workspace_client_bindings legacy WHERE legacy.workspace_id=workspace.id)
            AND site.status IN ('draft','active')
            AND entitlement.status='active' AND entitlement.plan_key<>'customer_preview_v1'
            AND entitlement.effective_from<=clock_timestamp()
            AND (entitlement.effective_until IS NULL OR entitlement.effective_until>clock_timestamp())
            AND entitlement.active_site_limit>0 AND entitlement.pages_per_site_limit>0
            AND entitlement.plan_metadata->'publishingEnabled'='true'::jsonb
            AND entitlement.plan_metadata->'managedBy'='"platform"'::jsonb
            AND jsonb_typeof(entitlement.plan_metadata->'allowedModules')='array'
            AND entitlement.plan_metadata->'allowedModules' @> '["business-content"]'::jsonb
          FOR SHARE OF session,account,identity,membership,workspace,owner,entitlement NOWAIT`, params)).rows
        if (rows.length !== 1) throw denied()
        const row = rows[0]!
        return { identityId: row.identity_id, accountId: row.account_id, workspaceId: row.workspace_id,
          entitlementId, expiresAt: new Date(row.expires_at).toISOString(),
          scope: { tenantId: row.tenant_id, businessId: row.business_id, clientId: row.business_id, siteId, environment: 'production' } }
      }
      await check()
      // Parent authority first, then site state, matching native publishing.
      if ((await db.query('SELECT id FROM page_studio_sites WHERE id=$1 FOR NO KEY UPDATE NOWAIT', [siteId])).rows.length !== 1) throw denied()
      const authority = await check()
      const result = await work(db, authority)
      await check()
      return result
    })
  } catch (error) {
    if ((error as { code?: string })?.code === '55P03') {
      throw createError({ statusCode: 503, statusMessage: 'Customer authoring access is changing. Retry the same operation.' })
    }
    throw error
  }
}
