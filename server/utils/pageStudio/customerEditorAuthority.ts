import { createError } from 'h3'
import { readCustomerAdoptionAuthority } from './customerAdoptionAuthority'
import { readCustomerProvisioningPreviewAuthority, readCustomerSessionIdentityFromHash } from './customerProvisioning'
import { withCustomerProductionAuthoringAuthority } from './customerAuthoringAuthority'
import { assertCustomerCmsSetupApproval } from './customerCmsSetupAuthority'
import type { PageStudioQueryClient } from '~~/shared/pageStudio/controlTypes'

export interface CustomerEditorAuthorityReceipt {
  environment: 'staging' | 'production'
  entitlement_id: string | null
  site_id: string
  login_session_hash: string
  purpose: 'editor' | 'cms-setup' | 'cms-adoption'
  adoption_grant_id?: string | null
  adoption_grant_revision?: number | null
}
const denied = () => createError({ statusCode: 403, statusMessage: 'Customer editor access is not available.' })
/** Receipt/configuration fields are server-owned. Every caller must compare the
 * returned identity and scope with its immutable handoff or child session. */
export async function readCustomerEditorAuthority(db: PageStudioQueryClient, receipt: CustomerEditorAuthorityReceipt) {
  if (receipt.purpose !== 'cms-adoption' && (receipt.adoption_grant_id != null || receipt.adoption_grant_revision != null)) throw denied()
  if (receipt.environment === 'production') {
    if (receipt.purpose !== 'editor' || !receipt.entitlement_id) throw denied()
    return withCustomerProductionAuthoringAuthority({ loginSessionHash: receipt.login_session_hash,
      siteId: receipt.site_id, entitlementId: receipt.entitlement_id }, async (_db, authority) => ({
      identityId: authority.identityId, expiresAt: authority.expiresAt,
      owned: { workspaceId: authority.workspaceId, scope: authority.scope }
    }), { runTransaction: work => work(db) })
  }
  if (receipt.environment !== 'staging' || receipt.entitlement_id !== null) throw denied()
  if (receipt.purpose === 'cms-adoption') return readCustomerAdoptionAuthority(db, receipt)
  const identityId = await readCustomerSessionIdentityFromHash(db, receipt.login_session_hash)
  const owned = await readCustomerProvisioningPreviewAuthority(db, receipt.site_id, identityId)
  const setup = receipt.purpose === 'cms-setup' ? await assertCustomerCmsSetupApproval(db, owned, identityId) : null
  if (receipt.purpose !== 'editor' && !setup) throw denied()
  return { identityId, owned, expiresAt: setup ? new Date(setup.expires_at).toISOString() : owned.policy.expiresAt }
}
