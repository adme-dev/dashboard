import { createError } from 'h3'
import { z } from 'zod'
import { transactionWithoutRetry } from '~~/server/utils/db'
import type { PageStudioQueryClient, RunPageStudioTransaction } from './sites'

const Id = z.string().uuid()
const Count = z.number().int().nonnegative().max(2147483647)
const Bytes = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const Request = z.object({
  requestId: Id, workspaceId: Id, expectedEntitlementId: Id,
  planKey: z.string().trim().min(2).max(80).regex(/^[a-z][a-z0-9._-]+$/).refine(value => value !== 'customer_preview_v1'),
  pagesPerSiteLimit: Count.min(1), storageBytesLimit: Bytes, domainLimit: Count.min(1),
  aiOperationLimit: Count, buildLimit: Count.min(1), trafficBytesLimit: Bytes,
  effectiveUntil: z.string().datetime({ offset: true }).transform(value => new Date(value).toISOString()).nullable(),
  reason: z.string().trim().min(3).max(1000)
}).strict()
const Receipt = z.object({ id: Id, workspaceId: Id, siteId: Id, planKey: z.string(), status: z.literal('active') }).strict()
const denied = () => createError({ statusCode: 403, statusMessage: 'Current platform plan administration is required' })
const conflict = () => createError({ statusCode: 409, statusMessage: 'The preview or plan request has changed. Review its current state.' })

/** Platform-wide authority, independent of selected accounting tenant. Never
 * treat workspace assistance or a customer session as plan administration. */
export async function requireCustomerPlanOperator(db: PageStudioQueryClient, actorId: string) {
  if (!Id.safeParse(actorId).success) throw denied()
  const staff = await db.query(`SELECT id FROM team_members WHERE id=$1
    AND is_active=TRUE AND user_role IN ('owner','admin') AND custom_role_id IS NULL FOR SHARE NOWAIT`, [actorId])
  if (staff.rows.length !== 1) throw denied()
}

/** Platform operator transaction, never exposed as a customer self-grant route.
 * The caller must authenticate the staff actor. We independently require a
 * current built-in platform owner/admin here. No payment, DNS, publication,
 * policy renewal or production editor session is created by this operation.
 * Only the initial one-site native preview -> publishing-plan transition is
 * supported; later plan changes need their own usage-aware lifecycle. */
export async function grantCustomerPublishingPlan(input: { actorId: string, body: unknown }, dependencies: {
  runTransaction?: RunPageStudioTransaction
} = {}) {
  const parsed = Request.safeParse(input.body)
  if (!parsed.success || !Id.safeParse(input.actorId).success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid customer publishing plan terms' })
  }
  const request = parsed.data, actorId = input.actorId
  try {
    return await (dependencies.runTransaction ?? transactionWithoutRetry)(async (db) => {
      await requireCustomerPlanOperator(db, actorId)
      const workspace = await db.query(`SELECT id FROM page_studio_customer_workspaces
        WHERE id=$1 AND status='active' FOR NO KEY UPDATE NOWAIT`, [request.workspaceId])
      if (workspace.rows.length !== 1) throw denied()
      const owner = (await db.query<{ id: string }>(`SELECT id FROM page_studio_business_owners
        WHERE workspace_id=$1 AND agency_client_id IS NULL
          AND NOT EXISTS (SELECT 1 FROM page_studio_workspace_client_bindings WHERE workspace_id=$1)
        FOR SHARE NOWAIT`, [request.workspaceId])).rows[0]
      if (!owner) throw denied()
      const scope = (await db.query<{ tenant_id: string, site_id: string }>(`SELECT tenant_id,site_id
        FROM page_studio_customer_site_requests WHERE workspace_id=$1 AND business_id=$2`, [request.workspaceId, owner.id])).rows[0]
      if (!scope || scope.tenant_id !== `studio-customer-${owner.id}`) throw denied()
      const params = [scope.tenant_id, owner.id, scope.site_id]
      const key = `native-plan:${request.requestId}`
      const prior = await db.query<{
        actor_id: string
        actor_role: string
        action: string
        resource_type: string
        resource_id: string
        matches: boolean
        metadata: { entitlement: unknown }
      }>(`
        SELECT actor_id,actor_role,action,resource_type,resource_id,metadata,
          (metadata->'request'=$5::jsonb) AS matches FROM page_studio_audit_events
        WHERE tenant_id=$1 AND client_id=$2 AND site_id=$3 AND idempotency_key=$4`,
      [...params, key, JSON.stringify(request)])
      if (prior.rows.length) {
        const saved = prior.rows[0]!, receipt = Receipt.safeParse(saved.metadata?.entitlement)
        if (prior.rows.length !== 1 || saved.actor_id !== actorId || saved.actor_role !== 'agency'
          || saved.action !== 'customer_publishing_plan_granted' || saved.resource_type !== 'entitlement'
          || !saved.matches || !receipt.success || receipt.data.workspaceId !== request.workspaceId
          || receipt.data.siteId !== scope.site_id || receipt.data.id !== saved.resource_id
          || receipt.data.planKey !== request.planKey) throw conflict()
        // This is a historical receipt, never a second activation.
        return { entitlement: receipt.data, replayed: true }
      }
      const time = await db.query(`SELECT 1 WHERE $1::timestamptz IS NULL OR $1::timestamptz>clock_timestamp()`, [request.effectiveUntil])
      if (!time.rows.length) throw createError({ statusCode: 400, statusMessage: 'Plan access must end in the future' })
      const plans = await db.query<{
        id: string
        status: string
        plan_key: string
        snapshot: Record<string, unknown>
        pages_per_site_limit: number
        storage_bytes_limit: string
        monthly_build_limit: number
        monthly_traffic_bytes_limit: string
      }>(`
        SELECT e.*,to_jsonb(e) AS snapshot FROM page_studio_entitlements e
        WHERE tenant_id=$1 AND client_id=$2 AND status<>'cancelled' FOR UPDATE NOWAIT`, params.slice(0, 2))
      const previous = plans.rows[0]
      if (plans.rows.length !== 1 || !previous || previous.id !== request.expectedEntitlementId
        || previous.status !== 'trial' || previous.plan_key !== 'customer_preview_v1') throw conflict()
      const sites = await db.query<{ id: string, entitlement_id: string, status: string }>(`
        SELECT id,entitlement_id,status FROM page_studio_sites WHERE tenant_id=$1 AND client_id=$2 FOR NO KEY UPDATE NOWAIT`, params.slice(0, 2))
      if (sites.rows.length !== 1 || sites.rows[0]!.id !== scope.site_id || sites.rows[0]!.status !== 'draft'
        || sites.rows[0]!.entitlement_id !== previous.id) throw conflict()
      // Initial upgrades cannot silently reduce any existing preview allowance.
      if (request.pagesPerSiteLimit < previous.pages_per_site_limit
        || BigInt(request.storageBytesLimit) < BigInt(previous.storage_bytes_limit)
        || request.buildLimit < previous.monthly_build_limit
        || BigInt(request.trafficBytesLimit) < BigInt(previous.monthly_traffic_bytes_limit)) throw conflict()
      await db.query('UPDATE page_studio_entitlements SET status=\'cancelled\' WHERE id=$1', [previous.id])
      const next = (await db.query<{ id: string, snapshot: Record<string, unknown> }>(`INSERT INTO page_studio_entitlements AS e
        (tenant_id,client_id,status,plan_key,active_site_limit,pages_per_site_limit,storage_bytes_limit,custom_domain_limit,
          monthly_ai_operation_limit,monthly_build_limit,monthly_traffic_bytes_limit,portal_creation_enabled,
          effective_from,effective_until,plan_metadata,created_by)
        VALUES($1,$2,'active',$3,1,$4,$5,$6,$7,$8,$9,FALSE,clock_timestamp(),$10,$11::jsonb,$12)
        RETURNING id,to_jsonb(e) AS snapshot`, [scope.tenant_id, owner.id, request.planKey,
        request.pagesPerSiteLimit, request.storageBytesLimit, request.domainLimit, request.aiOperationLimit,
        request.buildLimit, request.trafficBytesLimit, request.effectiveUntil,
        JSON.stringify({ publishingEnabled: true, managedBy: 'platform', allowedModules: ['business-content'] }), actorId])).rows[0]!
      await db.query('UPDATE page_studio_sites SET entitlement_id=$4 WHERE tenant_id=$1 AND client_id=$2 AND id=$3', [...params, next.id])
      const entitlement = Receipt.parse({ id: next.id, workspaceId: request.workspaceId, siteId: scope.site_id, planKey: request.planKey, status: 'active' })
      await db.query(`INSERT INTO page_studio_audit_events
        (tenant_id,client_id,site_id,actor_id,actor_role,action,resource_type,resource_id,idempotency_key,metadata)
        VALUES($1,$2,$3,$4,'agency','customer_publishing_plan_granted','entitlement',$5,$6,$7::jsonb)`,
      [...params, actorId, next.id, key, JSON.stringify({ request, entitlement,
        previousEntitlement: previous.snapshot, nextEntitlement: next.snapshot })])
      // No remote work occurs while locks are held. Check time again before commit.
      if (!(await db.query('SELECT 1 WHERE $1::timestamptz IS NULL OR $1::timestamptz>clock_timestamp()', [request.effectiveUntil])).rows.length) {
        throw createError({ statusCode: 400, statusMessage: 'Plan access expired during approval' })
      }
      return { entitlement, replayed: false }
    })
  } catch (error) {
    if ((error as { code?: string })?.code === '55P03') {
      throw createError({ statusCode: 503, statusMessage: 'Customer access is changing. Retry the same plan request.' })
    }
    throw error
  }
}
