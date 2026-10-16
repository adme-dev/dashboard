import { createError } from 'h3'
import { z } from 'zod'
import { transactionWithoutRetry } from '~~/server/utils/db'
import { collectionCanonical, collectionDigest } from '~~/shared/pageStudio/collectionApi'
import type { PageStudioQueryClient, RunPageStudioTransaction } from '~~/shared/pageStudio/controlTypes'

const Id = z.string().uuid()
const Hash = z.string().regex(/^[a-f0-9]{64}$/)
export const ManagedTransferAuthorityInputSchema = z.object({
  siteId: Id, entitlementId: Id, ownerLoginSessionHash: Hash,
  operator: z.object({ actorId: Id, loginSessionHash: Hash }).strict()
}).strict()
const denied = () => createError({ statusCode: 403, statusMessage: 'Current owner and platform operator transfer access is required' })
const busy = () => createError({ statusCode: 503, statusMessage: 'Transfer access is changing. Retry the same operation.' })
type DateValue = Date | string
interface OwnerRow {
  identity_id: string
  account_id: string
  workspace_id: string
  business_id: string
  tenant_id: string
  expires_at: DateValue
  created_at: DateValue
  plan: Record<string, unknown>
}
interface OperatorRow { issued_at: DateValue, expires_at: DateValue }
export interface ManagedTransferAuthority {
  owner: { identityId: string, accountId: string, workspaceId: string }
  operatorId: string
  entitlementId: string
  entitlementDigest: string
  expiresAt: string
  source: { tenantId: string, clientId: string, businessId: string, siteId: string, environment: 'staging' }
  destination: { tenantId: string, clientId: string, businessId: string, siteId: string, environment: 'production' }
}

/** Private, SQL-only admission for a managed staging -> production transfer.
 * Requires a genuine retained operator login AND the original native owner's
 * login under the exact publishing plan. An editor or publishing receipt is not
 * transfer admission. No remote work, allocation, graph selection, publication
 * or DNS operation happens here. The coordinator must persist an immutable intent
 * and verify source/target proofs separately before invoking remote phases.
 * Re-enter for every native phase using the original retained inputs; a new login
 * requires explicit recovery, never implicit substitution. Do not expose hashes
 * in HTTP responses, logs or general-purpose audit metadata.
 */
export async function withManagedTransferAuthority<T>(
  input: unknown,
  work: (db: PageStudioQueryClient, authority: ManagedTransferAuthority) => Promise<T>,
  dependencies: { runTransaction?: RunPageStudioTransaction } = {}
): Promise<T> {
  const parsed = ManagedTransferAuthorityInputSchema.safeParse(input)
  if (!parsed.success) throw denied()
  const { siteId, entitlementId, ownerLoginSessionHash, operator } = parsed.data
  try {
    return await (dependencies.runTransaction ?? transactionWithoutRetry)(async (db) => {
      const check = async () => {
        // Operator then native owner dependencies, then site. NOWAIT avoids
        // inversions with logout, plan approval and existing editor transactions.
        const operators = (await db.query<OperatorRow>(`
          SELECT login.issued_at,login.expires_at FROM page_studio_login_sessions login
          JOIN team_members staff ON staff.id::text=login.user_id
          WHERE login.role='agency' AND login.token_hash=$1 AND staff.id=$2
            AND login.revoked_at IS NULL AND login.issued_at<=clock_timestamp() AND login.expires_at>clock_timestamp()
            AND staff.is_active=TRUE AND staff.user_role IN ('owner','admin') AND staff.custom_role_id IS NULL
            AND (staff.sessions_invalidated_at IS NULL OR login.issued_at>staff.sessions_invalidated_at)
          FOR SHARE OF login,staff NOWAIT`, [operator.loginSessionHash, operator.actorId])).rows
        if (operators.length !== 1) throw denied()
        const owners = (await db.query<OwnerRow>(`
          SELECT identity.id AS identity_id,account.id AS account_id,receipt.workspace_id,receipt.business_id,receipt.tenant_id,
            session.created_at, LEAST(session.expires_at,membership.expires_at,entitlement.effective_until) AS expires_at,
            (to_jsonb(entitlement) - ARRAY['created_at','updated_at','effective_from','effective_until'])
              || jsonb_build_object('created_at',extract(epoch FROM entitlement.created_at)::text,
                'updated_at',extract(epoch FROM entitlement.updated_at)::text,
                'effective_from',extract(epoch FROM entitlement.effective_from)::text,
                'effective_until',extract(epoch FROM entitlement.effective_until)::text) AS plan
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
          FOR SHARE OF session,account,identity,membership,workspace,owner,receipt,entitlement NOWAIT`,
        [ownerLoginSessionHash, siteId, entitlementId])).rows
        if (owners.length !== 1) throw denied()
        const row = owners[0]!, staff = operators[0]!
        const scope = { tenantId: row.tenant_id, clientId: row.business_id, businessId: row.business_id, siteId }
        const authority: ManagedTransferAuthority = {
          owner: { identityId: row.identity_id, accountId: row.account_id, workspaceId: row.workspace_id },
          operatorId: operator.actorId, entitlementId, entitlementDigest: await collectionDigest(row.plan),
          expiresAt: new Date(Math.min(new Date(row.expires_at).getTime(), new Date(staff.expires_at).getTime())).toISOString(),
          source: { ...scope, environment: 'staging' }, destination: { ...scope, environment: 'production' }
        }
        return { authority, ownerCreatedAt: new Date(row.created_at).toISOString(),
          operatorIssuedAt: new Date(staff.issued_at).toISOString(), operatorExpiresAt: new Date(staff.expires_at).toISOString(),
          ownerExpiresAt: new Date(row.expires_at).toISOString() }
      }
      const original = await check()
      if ((await db.query('SELECT id FROM page_studio_sites WHERE id=$1 FOR NO KEY UPDATE NOWAIT', [siteId])).rows.length !== 1) throw denied()
      if (collectionCanonical(original) !== collectionCanonical(await check())) throw denied()
      // Keep the verification identity detached from the consumer's copy.
      const result = await work(db, structuredClone(original.authority))
      if (collectionCanonical(original) !== collectionCanonical(await check())) throw denied()
      return result
    })
  } catch (error) {
    if (['55P03', '40P01', '57014'].includes(String((error as { code?: string })?.code))) throw busy()
    throw error
  }
}
