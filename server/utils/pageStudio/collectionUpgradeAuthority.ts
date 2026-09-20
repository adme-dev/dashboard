import { createError } from 'h3'
import { z } from 'zod'
import { queryRowsFresh } from '~~/server/utils/db'
import { CollectionUpgradeOperationSchema, collectionUpgradeIdentity, type CollectionUpgradeOperation } from '~~/shared/pageStudio/collection-upgrade'
import { pageStudioAuthorityOwnerJoin } from './authoritySql'
import type { PageStudioControlQueryClient } from './controlStore'

const denied = () => createError({ statusCode: 403, statusMessage: 'Collection upgrade access denied' })
const unavailable = () => createError({ statusCode: 503, statusMessage: 'Collection upgrade authority unavailable' })
const Policy = z.object({
  allowedModules: z.array(z.string()).optional(),
  builder: z.object({ collectionSchemas: z.literal(true) })
})
interface Row { plan_metadata: unknown, metadata?: { intent?: unknown, identity?: unknown }, actor_id?: string, actor_role?: string }
type Read = (sql: string, params: unknown[]) => Promise<Row[]>
type NativeRequest = Pick<CollectionUpgradeOperation, 'scope' | 'actor'>

// Provisioning owner rules require staff edit permission, or portal admin/manager
// plus editor membership. Ordinary record editing never grants schema changes.
function query(request: NativeRequest, retained: boolean, lock: boolean) {
  const agency = request.actor.kind === 'agency-user'
  return `SELECT entitlement.plan_metadata${retained ? ', audit.metadata, audit.actor_id, audit.actor_role' : ''}
    FROM page_studio_sites site
    JOIN agency_clients client ON client.id=site.client_id AND client.is_active=TRUE
    JOIN page_studio_login_sessions login ON login.role=$5 AND login.token_hash=$6
      AND login.user_id=$4::text AND login.revoked_at IS NULL AND login.expires_at>clock_timestamp()
    ${pageStudioAuthorityOwnerJoin(agency, 'provisioning', 'clock_timestamp()')}
    JOIN page_studio_entitlements entitlement ON entitlement.id=site.entitlement_id
      AND entitlement.tenant_id=site.tenant_id AND entitlement.client_id=site.client_id
      AND entitlement.status IN ('trial','active') AND entitlement.effective_from<=clock_timestamp()
      AND (entitlement.effective_until IS NULL OR entitlement.effective_until>clock_timestamp())
      AND entitlement.active_site_limit>0 ${agency ? '' : 'AND entitlement.portal_creation_enabled'}
    ${retained
      ? `JOIN page_studio_audit_events audit ON audit.tenant_id=site.tenant_id AND audit.client_id=site.client_id
      AND audit.site_id=site.id AND audit.resource_id=$7 AND audit.action='content.collection-upgrade.requested'
      AND audit.resource_type='collection_upgrade'`
      : ''}
    WHERE site.tenant_id=$1 AND site.client_id=$2 AND site.id=$3 AND site.status IN ('draft','active')
      AND (SELECT count(*) FROM page_studio_sites counted WHERE counted.tenant_id=site.tenant_id
        AND counted.client_id=site.client_id AND counted.status<>'archived')<=entitlement.active_site_limit
      ${retained
        ? `AND NOT EXISTS(SELECT 1 FROM page_studio_audit_events cancelled
        WHERE cancelled.tenant_id=site.tenant_id AND cancelled.client_id=site.client_id AND cancelled.site_id=site.id
          AND cancelled.resource_id=$7 AND cancelled.resource_type='collection_upgrade'
          AND cancelled.action='content.collection-upgrade.disabled')`
        : ''}
    ${lock ? 'FOR SHARE' : ''}`
}
function params(request: NativeRequest) {
  const { scope, actor } = request
  return [scope.tenantId, scope.clientId, scope.siteId, actor.userId, actor.kind === 'agency-user' ? 'agency' : 'client', actor.loginSessionHash]
}
function checkPolicy(rows: Row[]) {
  if (rows.length !== 1) throw denied()
  const policy = Policy.safeParse(rows[0]!.plan_metadata)
  if (!policy.success || (policy.data.allowedModules && !policy.data.allowedModules.includes('business-content'))) throw denied()
}
export async function recheckPageStudioCollectionAuthority(db: PageStudioControlQueryClient, request: NativeRequest, lock = false) {
  // Business scope is currently the native client. Never let a persisted body
  // introduce an unrelated business identity under an otherwise valid site.
  if (request.scope.businessId !== request.scope.clientId) throw denied()
  checkPolicy((await db.query<Row>(query(request, false, lock), params(request))).rows)
}

/** Fresh native admission for the retained original request. No provider I/O or
 * cross-store commit fence; the coordinator separately checks its current lease. */
export async function authorizePageStudioCollectionUpgrade(input: unknown, environment: 'staging' | 'production', dependencies: { read?: Read } = {}) {
  const parsed = CollectionUpgradeOperationSchema.safeParse(input)
  if (!parsed.success || !['staging', 'production'].includes(environment) || parsed.data.scope.environment !== environment
    || parsed.data.scope.businessId !== parsed.data.scope.clientId) throw denied()
  const request = parsed.data
  // Hash before the final native snapshot, not after an arbitrarily slow await.
  const identity = await collectionUpgradeIdentity(request)
  let rows: Row[]
  try {
    rows = await (dependencies.read ?? queryRowsFresh<Row>)(query(request, true, false), [...params(request), request.operationId])
  } catch {
    throw unavailable()
  }
  checkPolicy(rows)
  const saved = rows[0]!, retained = CollectionUpgradeOperationSchema.safeParse(saved.metadata?.intent)
  if (!retained.success || JSON.stringify(retained.data) !== JSON.stringify(request)
    || saved.metadata?.identity !== identity || saved.actor_id !== request.actor.userId
    || saved.actor_role !== (request.actor.kind === 'agency-user' ? 'agency' : 'client')) throw denied()
  return request
}
