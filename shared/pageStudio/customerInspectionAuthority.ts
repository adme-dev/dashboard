import { z } from 'zod'

export const CustomerInspectionActor = z.object({
  actorId: z.string().uuid(), accountId: z.string().uuid(), siteId: z.string().uuid(),
  workspaceId: z.string().uuid().optional()
}).strict()
interface Database { query<T>(sql: string, params: unknown[]): Promise<{ rows: T[] }> }
export interface CustomerInspectionScope {
  tenantId: string
  clientId: string
  workspaceId: string
  canManagePublication: boolean
}
const denied = () => Object.assign(new Error('Website access is not available.'), { statusCode: 403 })

/** Native identity only. The HTTP boundary checks the original login before and
 * after remote work; the worker independently checks this exact workspace owner.
 * Reading status does not require, create or renew a publishing entitlement. */
export async function requireCustomerInspectionAuthority(db: Database, input: unknown, options: { lock?: boolean } = {}): Promise<CustomerInspectionScope> {
  const parsed = CustomerInspectionActor.safeParse(input)
  if (!parsed.success) throw denied()
  const actor = parsed.data
  const result = await db.query<CustomerInspectionScope>(`
    SELECT site.tenant_id AS "tenantId", site.client_id::text AS "clientId", workspace.id::text AS "workspaceId",
      (membership.role IN ('owner','manager') AND EXISTS (
        SELECT 1 FROM page_studio_entitlements entitlement
        WHERE entitlement.id=site.entitlement_id AND entitlement.tenant_id=site.tenant_id AND entitlement.client_id=site.client_id
          AND entitlement.status='active' AND entitlement.plan_key<>'customer_preview_v1'
          AND entitlement.effective_from<=clock_timestamp()
          AND (entitlement.effective_until IS NULL OR entitlement.effective_until>clock_timestamp())
          AND entitlement.active_site_limit>0 AND entitlement.custom_domain_limit>0
          AND entitlement.plan_metadata->'publishingEnabled'='true'::jsonb
      )) AS "canManagePublication"
    FROM page_studio_sites site
    JOIN page_studio_business_owners owner ON owner.id=site.client_id AND owner.agency_client_id IS NULL
    JOIN page_studio_customer_workspaces workspace ON workspace.id=owner.workspace_id AND workspace.status='active'
    JOIN page_studio_workspace_memberships membership ON membership.workspace_id=workspace.id AND membership.identity_id=$1
    JOIN page_studio_customer_identities identity ON identity.id=membership.identity_id
    JOIN page_studio_customer_accounts account ON account.identity_id=identity.id AND account.id=$2
    WHERE site.id=$3 AND ($4::uuid IS NULL OR workspace.id=$4) AND site.status IN ('draft','active')
      AND account.status='active' AND identity.status='active' AND identity.issuer='studio'
      AND identity.subject=account.id::text AND identity.portal_user_id IS NULL AND identity.verified_at<=clock_timestamp()
      AND membership.role IN ('owner','manager','editor','viewer') AND membership.revoked_at IS NULL
      AND (membership.expires_at IS NULL OR membership.expires_at>clock_timestamp())
      AND NOT EXISTS (SELECT 1 FROM page_studio_workspace_client_bindings legacy WHERE legacy.workspace_id=workspace.id)
    ${options.lock === false ? '' : 'FOR SHARE OF site,owner,workspace,membership,identity,account NOWAIT'}
  `, [actor.actorId, actor.accountId, actor.siteId, actor.workspaceId ?? null])
  if (result.rows.length !== 1) throw denied()
  return result.rows[0]!
}
