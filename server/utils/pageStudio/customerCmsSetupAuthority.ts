import { createError } from 'h3'
import type { PageStudioQueryClient } from '~~/shared/pageStudio/controlTypes'
import type { readCustomerProvisioningPreviewAuthority } from './customerProvisioning'

/** Native owner locks must be acquired first. The empty gate fails closed. Every
 * callback and final SQL fence rechecks it; approval withdrawal serializes here. */
export async function assertCustomerCmsSetupApproval(db: PageStudioQueryClient,
  owned: Awaited<ReturnType<typeof readCustomerProvisioningPreviewAuthority>>, identityId: string) {
  const { scope, policy, workspaceId } = owned
  const row = (await db.query<{ expires_at: Date }>(`SELECT expires_at FROM page_studio_customer_cms_setup_approvals
    WHERE environment=$1 AND tenant_id=$2 AND business_id=$3 AND workspace_id=$4 AND site_id=$5
      AND identity_id=$6 AND approved_by=$7 AND preview_policy=$8::jsonb AND enabled=TRUE
      AND expires_at>clock_timestamp() AND expires_at<=$9::timestamptz FOR SHARE`,
  [scope.environment, scope.tenantId, scope.businessId, workspaceId, scope.siteId, identityId,
    policy.approvedBy, JSON.stringify(policy), policy.expiresAt])).rows[0]
  if (!row) throw createError({ statusCode: 403, statusMessage: 'Customer CMS setup is not available.' })
  return row
}
