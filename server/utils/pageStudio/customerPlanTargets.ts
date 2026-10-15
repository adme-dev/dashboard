import { createError } from 'h3'
import { z } from 'zod'
import { transactionWithoutRetry } from '~~/server/utils/db'
import { requireCustomerPlanOperator } from './customerPlanGrants'
import type { RunPageStudioTransaction } from './sites'
import type { CustomerPlanTarget, CustomerPlanTargets } from '~~/shared/pageStudio/customerPlans'

const Query = z.object({ after: z.string().uuid().optional() }).strict()
/** Global native-account list for platform operators, not selected agency clients.
 * Bounded keyset pagination; no account email, credentials or login hashes. */
export async function listCustomerPlanTargets(actorId: string, input: unknown, dependencies: {
  runTransaction?: RunPageStudioTransaction
} = {}): Promise<CustomerPlanTargets> {
  const query = Query.safeParse(input)
  if (!query.success) throw createError({ statusCode: 400, statusMessage: 'Invalid customer plan query' })
  try {
    return await (dependencies.runTransaction ?? transactionWithoutRetry)(async (db) => {
      await requireCustomerPlanOperator(db, actorId)
      const result = await db.query<CustomerPlanTarget>(`SELECT w.id AS "workspaceId",w.name AS "workspaceName",
        s.id AS "siteId",s.name AS "siteName",e.id AS "entitlementId",e.plan_key AS "planKey",e.status,
        e.effective_until AS "effectiveUntil",
        (w.status='active' AND s.status='draft' AND e.status='trial' AND e.plan_key='customer_preview_v1'
          AND NOT EXISTS (SELECT 1 FROM page_studio_sites other WHERE other.tenant_id=s.tenant_id AND other.client_id=s.client_id AND other.id<>s.id)) AS eligible,
        jsonb_build_object('pagesPerSiteLimit',e.pages_per_site_limit,'storageBytesLimit',e.storage_bytes_limit,
          'domainLimit',e.custom_domain_limit,'aiOperationLimit',e.monthly_ai_operation_limit,
          'buildLimit',e.monthly_build_limit,'trafficBytesLimit',e.monthly_traffic_bytes_limit) AS limits
        FROM page_studio_customer_workspaces w
        JOIN page_studio_business_owners o ON o.workspace_id=w.id AND o.agency_client_id IS NULL
        JOIN page_studio_customer_site_requests r ON r.workspace_id=w.id AND r.business_id=o.id
        JOIN page_studio_sites s ON s.id=r.site_id AND s.client_id=o.id AND s.tenant_id=r.tenant_id
        JOIN page_studio_entitlements e ON e.id=s.entitlement_id AND e.tenant_id=s.tenant_id AND e.client_id=s.client_id
        WHERE s.tenant_id='studio-customer-'||o.id::text
          AND NOT EXISTS (SELECT 1 FROM page_studio_workspace_client_bindings legacy WHERE legacy.workspace_id=w.id)
          AND ($1::uuid IS NULL OR w.id>$1::uuid)
        ORDER BY w.id LIMIT 51`, [query.data.after ?? null])
      const targets = result.rows.slice(0, 50)
      return { targets, nextCursor: result.rows.length > 50 ? targets[49]!.workspaceId : null }
    })
  } catch (error) {
    if ((error as { code?: string })?.code === '55P03') throw createError({ statusCode: 503, statusMessage: 'Plan administration access is changing. Retry shortly.' })
    throw error
  }
}
