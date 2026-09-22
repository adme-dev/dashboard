import { DomainManagementActorSchema, type DomainManagementActor } from '../../../shared/pageStudio/domainManagement'
import type { DomainDatabase } from './domainAttachment'
import { agencyAuthority } from './domainManagement'
import { StagingStoreError } from './stagingStore'

/** Fresh native permissions; the platform preview never consumes domain quota. */
export async function requireStagingAuthority(db: DomainDatabase, rawActor: DomainManagementActor, siteId: string, writing: boolean) {
  const actor = DomainManagementActorSchema.parse(rawActor)
  const denied = () => new StagingStoreError('STAGING_ACCESS_DENIED', 403)
  let canManage = false
  if (actor.kind === 'agency') {
    try {
      canManage = await agencyAuthority(db, actor.actorId, 'PAGE_STUDIO_VIEW')
    } catch {
      throw denied()
    }
    if (writing && !canManage) throw denied()
  }
  const result = await db.query<{ tenantId: string, clientId: string, siteId: string, canManage: boolean }>(`SELECT site.tenant_id AS "tenantId",site.client_id::text AS "clientId",site.id::text AS "siteId",
    ${actor.kind === 'portal' ? `(portal_user.role IN ('admin','manager') AND membership.role='editor')` : '$4::boolean'} AS "canManage"
    FROM page_studio_sites site
    JOIN agency_clients client ON client.id=site.client_id AND client.is_active=TRUE
    JOIN page_studio_entitlements entitlement ON entitlement.id=site.entitlement_id AND entitlement.tenant_id=site.tenant_id
      AND entitlement.client_id=site.client_id AND entitlement.status IN ('trial','active')
      AND entitlement.effective_from<=clock_timestamp() AND (entitlement.effective_until IS NULL OR entitlement.effective_until>clock_timestamp())
    ${actor.kind === 'portal'
      ? `JOIN client_users portal_user ON portal_user.id=$3 AND portal_user.client_id=site.client_id
      AND portal_user.status='active' AND portal_user.role IN ('admin','manager','viewer')
      JOIN page_studio_site_memberships membership ON membership.tenant_id=site.tenant_id AND membership.client_id=site.client_id
        AND membership.site_id=site.id AND membership.user_id=portal_user.id AND membership.role IN ('editor','viewer')`
      : ''}
    WHERE site.id=$1 AND ${actor.kind === 'portal' ? 'site.client_id=$2' : 'site.tenant_id=$2 AND $3::uuid IS NOT NULL'}
      AND site.status IN ('draft','active')
    FOR NO KEY UPDATE OF site FOR SHARE OF client,entitlement${actor.kind === 'portal' ? ',portal_user,membership' : ''}`,
  actor.kind === 'portal' ? [siteId, actor.clientId, actor.actorId] : [siteId, actor.tenantId, actor.actorId, canManage])
  const row = result.rows[0]
  if (result.rows.length !== 1 || !row || (writing && row.canManage !== true)) throw denied()
  return { scope: { tenantId: row.tenantId, clientId: row.clientId, siteId: row.siteId }, canManage: row.canManage }
}
