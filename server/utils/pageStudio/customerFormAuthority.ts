import { createError } from 'h3'
import { z } from 'zod'
import { transaction } from '~~/server/utils/db'
import { digestPortalSessionToken } from '~~/server/utils/portalSession'
import { readCustomerSession } from './customerSignup'
import { CustomerPreviewPolicySchema, readApprovedCustomerPreviewSite } from './customerSites'
import type { RunPageStudioTransaction } from './sites'

const Request = z.object({
  sessionToken: z.string().regex(/^[A-Za-z0-9_-]{64}$/),
  siteId: z.string().uuid(),
  environment: z.literal('staging'),
  writing: z.boolean()
}).strict()
type CustomerFormRole = 'owner' | 'manager' | 'editor' | 'viewer'
export interface CustomerFormAuthority {
  workspaceId: string
  scope: { businessId: string, clientId: string, tenantId: string, siteId: string, environment: 'staging' }
  actor: { kind: 'customer-user', userId: string, accountId: string }
  canEdit: boolean
}
interface Ownership {
  workspace_id: string
  business_id: string
  tenant_id: string
  preview_policy: unknown
  role: CustomerFormRole
}
const denied = () => createError({ statusCode: 403, statusMessage: 'Customer form access is not available.' })

/** Ordinary native form CRUD uses current membership, independently of the
 * immutable provisioning actor or its original setup login. Call again after
 * awaited document/worker operations; this result is not an authority cache. */
export async function resolveCustomerFormAuthority(input: unknown, dependencies: {
  runTransaction?: RunPageStudioTransaction
} = {}): Promise<CustomerFormAuthority> {
  const parsed = Request.safeParse(input)
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Check your details and try again.' })
  const request = parsed.data
  const loginHash = await digestPortalSessionToken(request.sessionToken)
  return (dependencies.runTransaction ?? transaction)(async (db) => {
    // Match native signup lock order: account, identity, session, then ownership.
    const user = await readCustomerSession(request.sessionToken, callback => callback(db))
    const row = (await db.query<Ownership>(`
      SELECT receipt.workspace_id, receipt.business_id, receipt.tenant_id, receipt.preview_policy, membership.role
      FROM page_studio_customer_site_requests receipt
      JOIN page_studio_business_owners owner ON owner.id = receipt.business_id AND owner.workspace_id = receipt.workspace_id
      JOIN page_studio_customer_workspaces workspace ON workspace.id = owner.workspace_id
      JOIN page_studio_workspace_memberships membership ON membership.workspace_id = workspace.id
      WHERE receipt.site_id = $1 AND owner.agency_client_id IS NULL
        AND workspace.status = 'active' AND membership.identity_id = $2
        AND membership.role IN ('owner', 'manager', 'editor', 'viewer') AND membership.revoked_at IS NULL
        AND (membership.expires_at IS NULL OR membership.expires_at > clock_timestamp())
        AND NOT EXISTS (SELECT 1 FROM page_studio_workspace_client_bindings legacy WHERE legacy.workspace_id = workspace.id)
      FOR SHARE OF workspace, membership, owner`, [request.siteId, user.identityId])).rows[0]
    if (!row || (request.writing && row.role === 'viewer')) throw denied()
    const policy = CustomerPreviewPolicySchema.safeParse(row.preview_policy)
    if (!policy.success) throw denied()
    const approver = await db.query(`SELECT id FROM team_members WHERE id = $1 AND is_active = TRUE
      AND $2::timestamptz > clock_timestamp() FOR SHARE`, [policy.data.approvedBy, policy.data.expiresAt])
    if (!approver.rows[0]) throw denied()
    const scope: CustomerFormAuthority['scope'] = { businessId: row.business_id, clientId: row.business_id,
      tenantId: row.tenant_id, siteId: request.siteId, environment: 'staging' }
    try {
      // Share the exact retained entitlement/policy test used by native ownership
      // readers. It also locks the matching site and entitlement against changes.
      await readApprovedCustomerPreviewSite(db, scope, policy.data)
    } catch (error) {
      if ((error as { code?: string })?.code === 'CUSTOMER_SITE_ACCESS_DENIED') throw denied()
      throw error
    }
    // The locks above can wait. Recheck all deadlines in one fresh DB statement
    // after acquiring them, rather than using JS time or the transaction's NOW().
    const current = await db.query<{ role: CustomerFormRole }>(`
      SELECT membership.role
      FROM page_studio_customer_sessions session
      JOIN page_studio_customer_accounts account ON account.id = session.account_id
      JOIN page_studio_customer_identities identity ON identity.id = account.identity_id
      JOIN page_studio_workspace_memberships membership ON membership.identity_id = identity.id
      JOIN page_studio_customer_workspaces workspace ON workspace.id = membership.workspace_id
      JOIN page_studio_customer_site_requests receipt ON receipt.workspace_id = workspace.id
      JOIN page_studio_sites site ON site.id = receipt.site_id
        AND site.tenant_id = receipt.tenant_id AND site.client_id = receipt.business_id
      JOIN page_studio_entitlements entitlement ON entitlement.id = site.entitlement_id
        AND entitlement.tenant_id = site.tenant_id AND entitlement.client_id = site.client_id
      WHERE session.token_hash = $1 AND account.id = $2 AND identity.id = $3
        AND session.revoked_at IS NULL AND session.expires_at > clock_timestamp()
        AND account.status = 'active' AND identity.status = 'active' AND identity.verified_at <= clock_timestamp()
        AND identity.issuer = 'studio' AND identity.subject = account.id::text
        AND workspace.id = $4 AND workspace.status = 'active' AND site.id = $5 AND site.status = 'draft'
        AND membership.role IN ('owner', 'manager', 'editor', 'viewer') AND membership.revoked_at IS NULL
        AND (membership.expires_at IS NULL OR membership.expires_at > clock_timestamp())
        AND entitlement.effective_from <= clock_timestamp() AND entitlement.effective_until > clock_timestamp()
        AND $6::timestamptz > clock_timestamp()`,
    [loginHash, user.accountId, user.identityId, row.workspace_id, request.siteId, policy.data.expiresAt])
    const role = current.rows[0]?.role
    if (!role || (request.writing && role === 'viewer')) throw denied()
    return { workspaceId: row.workspace_id, scope,
      actor: { kind: 'customer-user', userId: user.identityId, accountId: user.accountId }, canEdit: role !== 'viewer' }
  })
}
