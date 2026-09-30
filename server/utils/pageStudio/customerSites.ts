import { z } from 'zod'
import { transaction } from '~~/server/utils/db'
import { resolveCustomerWorkspaceAccess } from '~~/server/utils/pageStudio/customerWorkspaces'
import type { PageStudioQueryClient, RunPageStudioTransaction } from '~~/server/utils/pageStudio/sites'

const Id = z.string().uuid()
const Request = z.object({
  workspaceId: Id, identityId: Id, requestId: Id,
  name: z.string().trim().min(1).max(160),
  route: z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/),
  starterVersion: z.string().trim().min(1).max(128)
}).strict()
const Limit = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
// Trusted server-side approval only. Never deserialize this from a customer body.
// One unpublished preview, no AI credits, custom domains or charge authorization.
export const CustomerPreviewPolicySchema = z.object({
  approvalId: Id, approvedBy: Id, expiresAt: z.string().datetime(),
  pagesPerSiteLimit: z.number().int().min(1).max(1000), storageBytesLimit: Limit,
  monthlyBuildLimit: z.number().int().nonnegative().max(2147483647), monthlyTrafficBytesLimit: Limit
}).strict()
export type CustomerPreviewPolicy = z.infer<typeof CustomerPreviewPolicySchema>

export class CustomerSiteError extends Error {
  constructor(readonly code: 'CUSTOMER_SITE_INVALID_INPUT' | 'CUSTOMER_SITE_POLICY_REQUIRED' | 'CUSTOMER_SITE_ACCESS_DENIED'
    | 'CUSTOMER_SITE_REQUEST_CONFLICT' | 'CUSTOMER_SITE_LIMIT_REACHED', readonly statusCode: number) {
    super('Customer preview site could not be created')
    this.name = 'CustomerSiteError'
  }
}
const denied = () => new CustomerSiteError('CUSTOMER_SITE_ACCESS_DENIED', 403)
interface Site { id: string, name: string, route: string, starterVersion: string, status: 'draft' }

export async function readApprovedCustomerPreviewSite(db: PageStudioQueryClient, scope: { businessId: string, tenantId: string, siteId: string }, policy: CustomerPreviewPolicy) {
  // Recheck retained authority, not just the existence of a past creation receipt.
  const result = await db.query<Site>(`SELECT site.id, site.name, site.route, site.starter_version AS "starterVersion", site.status
    FROM page_studio_sites site JOIN page_studio_entitlements entitlement
      ON entitlement.id = site.entitlement_id AND entitlement.tenant_id = site.tenant_id AND entitlement.client_id = site.client_id
    WHERE site.id = $1 AND site.client_id = $2 AND site.tenant_id = $3 AND site.status = 'draft'
      AND entitlement.status = 'trial' AND entitlement.plan_key = 'customer_preview_v1'
      AND entitlement.effective_from <= clock_timestamp() AND entitlement.effective_until > clock_timestamp()
      AND entitlement.effective_until = $4::timestamptz
      AND entitlement.active_site_limit = 1 AND entitlement.custom_domain_limit = 0
      AND entitlement.monthly_ai_operation_limit = 0 AND entitlement.portal_creation_enabled = FALSE
      AND entitlement.pages_per_site_limit = $5 AND entitlement.storage_bytes_limit = $6
      AND entitlement.monthly_build_limit = $7 AND entitlement.monthly_traffic_bytes_limit = $8
      AND entitlement.plan_metadata = $9::jsonb
    FOR UPDATE OF site, entitlement`, [scope.siteId, scope.businessId, scope.tenantId, policy.expiresAt,
    policy.pagesPerSiteLimit, policy.storageBytesLimit, policy.monthlyBuildLimit, policy.monthlyTrafficBytesLimit,
    JSON.stringify({ previewPolicy: policy, publishingEnabled: false })])
  if (!result.rows[0]) throw denied()
  return result.rows[0]
}

/** Internal prerequisite only: no public route, provisioning dispatch or runtime access. */
export async function createCustomerPreviewSite(input: z.infer<typeof Request>, dependencies: {
  previewPolicy?: unknown
  runTransaction?: RunPageStudioTransaction
} = {}) {
  const parsed = Request.safeParse(input)
  if (!parsed.success) throw new CustomerSiteError('CUSTOMER_SITE_INVALID_INPUT', 400)
  const approved = CustomerPreviewPolicySchema.safeParse(dependencies.previewPolicy)
  if (!approved.success) throw new CustomerSiteError('CUSTOMER_SITE_POLICY_REQUIRED', 403)
  const request = parsed.data, policy = approved.data
  const runTransaction = dependencies.runTransaction ?? transaction
  return runTransaction(async (db) => {
    // Locks verified identity, workspace and membership in the same transaction.
    // Serializes different owners as well as duplicate requests for this workspace.
    const access = await resolveCustomerWorkspaceAccess({ workspaceId: request.workspaceId, identityId: request.identityId }, callback => callback(db))
    if (access.role !== 'owner' || access.legacyBinding) throw denied()
    const approver = await db.query(`SELECT id FROM team_members WHERE id = $1 AND is_active = TRUE
      AND $2::timestamptz > clock_timestamp() FOR SHARE`, [policy.approvedBy, policy.expiresAt])
    if (!approver.rows[0]) throw new CustomerSiteError('CUSTOMER_SITE_POLICY_REQUIRED', 403)

    const prior = await db.query<{ request_id: string, business_id: string, tenant_id: string, site_id: string, matches: boolean }>(`
      SELECT request_id, business_id, tenant_id, site_id,
        (request_payload = $2::jsonb AND preview_policy = $3::jsonb AND actor_identity_id = $4) AS matches
      FROM page_studio_customer_site_requests WHERE workspace_id = $1`,
    [request.workspaceId, JSON.stringify(request), JSON.stringify(policy), request.identityId])
    const receipt = prior.rows[0]
    if (receipt) {
      if (receipt.request_id !== request.requestId) throw new CustomerSiteError('CUSTOMER_SITE_LIMIT_REACHED', 409)
      if (!receipt.matches) throw new CustomerSiteError('CUSTOMER_SITE_REQUEST_CONFLICT', 409)
      const scope = { businessId: receipt.business_id, tenantId: receipt.tenant_id, siteId: receipt.site_id }
      const site = await readApprovedCustomerPreviewSite(db, scope, policy)
      return { workspaceId: request.workspaceId, businessId: scope.businessId, tenantId: scope.tenantId, site, replayed: true }
    }

    // Never attach an unrelated, pre-existing entitlement or overwrite ownership.
    const existing = await db.query('SELECT id FROM page_studio_business_owners WHERE workspace_id = $1', [request.workspaceId])
    if (existing.rows.length) throw new CustomerSiteError('CUSTOMER_SITE_REQUEST_CONFLICT', 409)
    const { rows: [owner] } = await db.query<{ id: string }>(`INSERT INTO page_studio_business_owners (workspace_id) VALUES ($1) RETURNING id`, [request.workspaceId])
    const businessId = owner!.id
    const tenantId = `studio-customer-${businessId}`
    const { rows: [entitlement] } = await db.query<{ id: string }>(`INSERT INTO page_studio_entitlements
      (tenant_id, client_id, status, plan_key, active_site_limit, pages_per_site_limit, storage_bytes_limit,
       custom_domain_limit, monthly_ai_operation_limit, monthly_build_limit, monthly_traffic_bytes_limit,
       portal_creation_enabled, effective_until, plan_metadata, created_by)
      VALUES ($1, $2, 'trial', 'customer_preview_v1', 1, $3, $4, 0, 0, $5, $6, FALSE, $7, $8::jsonb, $9) RETURNING id`,
    [tenantId, businessId, policy.pagesPerSiteLimit, policy.storageBytesLimit, policy.monthlyBuildLimit,
      policy.monthlyTrafficBytesLimit, policy.expiresAt, JSON.stringify({ previewPolicy: policy, publishingEnabled: false }), policy.approvedBy])
    const { rows: [created] } = await db.query<{ id: string }>(`INSERT INTO page_studio_sites
      (tenant_id, client_id, entitlement_id, name, route, starter_version, status)
      VALUES ($1, $2, $3, $4, $5, $6, 'draft') RETURNING id`,
    [tenantId, businessId, entitlement!.id, request.name, request.route, request.starterVersion])
    await db.query(`INSERT INTO page_studio_customer_site_requests
      (workspace_id, request_id, actor_identity_id, business_id, tenant_id, site_id, request_payload, preview_policy)
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb)`, [request.workspaceId, request.requestId,
      request.identityId, businessId, tenantId, created!.id, JSON.stringify(request), JSON.stringify(policy)])
    const site = await readApprovedCustomerPreviewSite(db, { businessId, tenantId, siteId: created!.id }, policy)
    return { workspaceId: request.workspaceId, businessId, tenantId, site, replayed: false }
  })
}
