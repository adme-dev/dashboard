import type { PageStudioControlQueryClient } from '~~/shared/pageStudio/controlTypes'
import { PageStudioBusinessContentError } from './businessContent'

const denied = () => new PageStudioBusinessContentError('PUBLISHED_FEATURE_UNAVAILABLE', 409, 'The published feature is unavailable or changed. Reload the page.')
/** A current publication is the principal. Native customer ownership is checked
 * without borrowing a publisher login; logout alone cannot take a website down.
 * The caller separately locks/checks the current site, package and live pointer. */
export async function lockPublishedSiteOwner(db: PageStudioControlQueryClient, scope: { tenantId: string, clientId: string, siteId: string }) {
  const legacy = (await db.query<{ id: string, is_active: boolean }>('SELECT id,is_active FROM agency_clients WHERE id=$1 FOR SHARE NOWAIT', [scope.clientId])).rows
  if (legacy.length) {
    if (legacy.length !== 1 || legacy[0]!.is_active !== true) throw denied()
    return
  }
  const rows = (await db.query(`SELECT owner.id,workspace.id AS workspace_id,identity.id AS identity_id
    FROM page_studio_business_owners owner
    JOIN page_studio_customer_workspaces workspace ON workspace.id=owner.workspace_id
    JOIN page_studio_customer_site_requests receipt ON receipt.workspace_id=workspace.id AND receipt.business_id=owner.id
    JOIN page_studio_workspace_memberships membership ON membership.workspace_id=workspace.id
    JOIN page_studio_customer_identities identity ON identity.id=membership.identity_id
    JOIN page_studio_customer_accounts account ON account.identity_id=identity.id
    WHERE owner.id=$1 AND owner.agency_client_id IS NULL
      AND receipt.tenant_id=$2 AND receipt.site_id=$3 AND receipt.tenant_id='studio-customer-' || owner.id::text
      AND workspace.status='active' AND membership.role='owner' AND membership.revoked_at IS NULL
      AND (membership.expires_at IS NULL OR membership.expires_at>clock_timestamp())
      AND identity.status='active' AND identity.issuer='studio' AND identity.portal_user_id IS NULL
      AND identity.subject=account.id::text AND identity.verified_at<=clock_timestamp() AND account.status='active'
      AND NOT EXISTS (SELECT 1 FROM page_studio_workspace_client_bindings legacy WHERE legacy.workspace_id=workspace.id)
    FOR SHARE OF owner,workspace,receipt,membership,identity,account NOWAIT`, [scope.clientId, scope.tenantId, scope.siteId])).rows
  if (!rows.length) throw denied()
}
