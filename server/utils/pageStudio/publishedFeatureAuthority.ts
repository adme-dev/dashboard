import { z } from 'zod'
import { transactionWithoutRetry } from '~~/server/utils/db'
import { PageStudioContentScopeSchema } from '~~/shared/pageStudio/businessContent'
import { CmsStorageTargetSchema, contentScopeKey } from '~~/shared/pageStudio/cmsManaged'
import { PageStudioHostnameSchema } from './delivery'
import { PageStudioBusinessContentError } from './businessContent'
import { cmsEqual, lockCmsContext } from './cmsVisibility'
import { assertSoleCmsAuthoringScope, type CmsGraphDependencies } from './cmsGraphCoordinator'
import { FeatureSealMarkerSchema } from './releaseFeatureBuild'
import type { PageStudioControlQueryClient } from './controlStore'

const digest = z.string().regex(/^[a-f0-9]{64}$/)
const id = z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/)
export const PublishedFeatureRequestSchema = z.object({
  hostname: PageStudioHostnameSchema,
  releaseId: z.uuid(), buildId: id, versionDigest: digest, manifestDigest: digest, sealDigest: digest,
  pageRoute: z.string().max(240).regex(/^\/(?:[a-z0-9][a-z0-9_-]*(?:\/[a-z0-9][a-z0-9_-]*)*)?$/)
}).strict()
export type PublishedFeatureRequest = z.infer<typeof PublishedFeatureRequestSchema>
const sealIdentity = z.object({
  approvalId: id, reference: FeatureSealMarkerSchema,
  recovery: z.object({ key: z.string().regex(/^builder-recovery\/v1\/[a-f0-9]{64}\/[a-f0-9]{64}\/[a-f0-9]{64}\.json$/), bytes: z.number().int().min(1).max(8_000_000), sha256: digest }).strict(),
  application: z.object({ id, digest }).strict(), checkpoint: id, generation: z.uuid(), target: CmsStorageTargetSchema,
  freezeDigest: digest, runtimeDigest: digest, contentScope: PageStudioContentScopeSchema,
  versionId: id
}).strict()
const policy = z.object({ builder: z.object({ collectionSchemas: z.literal(true) }), allowedModules: z.array(z.string()).optional() })
export const publishedFeatureDenied = () => new PageStudioBusinessContentError('PUBLISHED_FEATURE_UNAVAILABLE', 409, 'The published feature is unavailable or changed. Reload the page.')
export interface PublishedFeatureSnapshot {
  request: PublishedFeatureRequest
  releaseEnvironment: 'staging' | 'production'
  release: { hostname: string, releaseId: string, buildId: string, versionDigest: string, manifestDigest: string, sealDigest: string, pointerVersion: number, activationId: string }
  contentScope: z.infer<typeof PageStudioContentScopeSchema>
  seal: z.infer<typeof sealIdentity>
  context: Awaited<ReturnType<typeof lockCmsContext>>
}
async function one(db: PageStudioControlQueryClient, sql: string, params: unknown[]) {
  const rows = (await db.query<Record<string, unknown>>(sql, params)).rows
  if (rows.length !== 1) throw publishedFeatureDenied()
  return rows[0]!
}
function scoped(row: Record<string, unknown>, scope: { tenantId: string, clientId: string, siteId: string }) {
  return row.tenant_id === scope.tenantId && row.client_id === scope.clientId && row.site_id === scope.siteId
}
async function locked(db: PageStudioControlQueryClient, request: PublishedFeatureRequest, env: Record<string, unknown>, purpose: 'projection' | 'action'): Promise<PublishedFeatureSnapshot> {
  const configured = z.enum(['staging', 'production']).safeParse(env.PAGE_STUDIO_RELEASE_ENVIRONMENT)
  if (!configured.success) throw new PageStudioBusinessContentError('PUBLISHED_RELEASE_ENVIRONMENT_UNAVAILABLE', 503, 'Published feature environment is unavailable')
  const releaseEnvironment = configured.data
  // Discovery does not authorize. Scope is rechecked after locking the site and pointer.
  const discovered = await one(db, 'SELECT tenant_id,client_id,site_id FROM page_studio_release_pointers WHERE environment=$2 AND normalized_hostname=$1', [request.hostname, releaseEnvironment])
  const scope = { tenantId: String(discovered.tenant_id), clientId: String(discovered.client_id), siteId: String(discovered.site_id) }
  const site = await one(db, 'SELECT id,tenant_id,client_id,entitlement_id,status,current_release_id FROM page_studio_sites WHERE tenant_id=$1 AND client_id=$2 AND id=$3 FOR NO KEY UPDATE', [scope.tenantId, scope.clientId, scope.siteId])
  if (!(releaseEnvironment === 'production' ? ['active'] : ['draft', 'active']).includes(String(site.status))) throw publishedFeatureDenied()
  if (purpose === 'action') await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [JSON.stringify(['page-studio-ai-usage', scope.tenantId, scope.clientId])])
  const entitlement = await one(db, `SELECT id,tenant_id,client_id,status,plan_metadata,
    (effective_from <= clock_timestamp() AND (effective_until IS NULL OR effective_until > clock_timestamp())) AS effective,
    (active_site_limit>0 AND (SELECT count(*) FROM page_studio_sites counted WHERE counted.tenant_id=$2 AND counted.client_id=$3 AND counted.status<>'archived')<=active_site_limit) AS capacity
    FROM page_studio_entitlements WHERE id=$1 AND tenant_id=$2 AND client_id=$3 FOR SHARE NOWAIT`, [site.entitlement_id, scope.tenantId, scope.clientId])
  const client = await one(db, 'SELECT id,is_active FROM agency_clients WHERE id=$1 FOR SHARE NOWAIT', [scope.clientId])
  const packagePolicy = policy.safeParse(entitlement.plan_metadata)
  if (
    !['trial', 'active'].includes(String(entitlement.status))
    || entitlement.effective !== true
    || entitlement.capacity !== true
    || client.is_active !== true
    || !packagePolicy.success
    || (packagePolicy.data.allowedModules && !packagePolicy.data.allowedModules.includes('business-content'))
  ) throw publishedFeatureDenied()
  if (purpose === 'action' && !z.object({ builder: z.object({ actionExecution: z.literal(true) }) }).safeParse(entitlement.plan_metadata).success) throw publishedFeatureDenied()
  const pointer = await one(db, 'SELECT * FROM page_studio_release_pointers WHERE environment=$2 AND normalized_hostname=$1 FOR SHARE NOWAIT', [request.hostname, releaseEnvironment])
  const epoch = z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER).parse(pointer.pointer_version)
  if (!scoped(pointer, scope) || pointer.environment !== releaseEnvironment || pointer.active_release_id !== request.releaseId) throw publishedFeatureDenied()
  const release = await one(db, 'SELECT * FROM page_studio_releases WHERE tenant_id=$1 AND client_id=$2 AND site_id=$3 AND id=$4 FOR SHARE NOWAIT', [scope.tenantId, scope.clientId, scope.siteId, request.releaseId])
  const build = await one(db, 'SELECT * FROM page_studio_builds WHERE tenant_id=$1 AND client_id=$2 AND site_id=$3 AND id=$4 FOR SHARE NOWAIT', [scope.tenantId, scope.clientId, scope.siteId, request.buildId])
  if (
    !scoped(release, scope)
    || !scoped(build, scope)
    || release.environment !== releaseEnvironment
    || release.normalized_hostname !== request.hostname
    || release.build_id !== request.buildId
    || build.state !== 'succeeded'
    || build.version_digest !== request.versionDigest
    || build.release_manifest_digest !== request.manifestDigest
  ) throw publishedFeatureDenied()
  const activation = await one(db, 'SELECT * FROM page_studio_release_feature_activations WHERE environment=$3 AND hostname=$1 AND pointer_version=$2 FOR SHARE NOWAIT', [request.hostname, epoch, releaseEnvironment])
  if (
    activation.environment !== releaseEnvironment
    || activation.state !== 'enabled'
    || activation.revoked_at !== null
    || activation.release_id !== request.releaseId
    || activation.build_id !== request.buildId
    || activation.seal_digest !== request.sealDigest
    || Number(activation.pointer_version) !== epoch
  ) throw publishedFeatureDenied()
  const seal = await one(db, 'SELECT * FROM page_studio_release_feature_seals WHERE scope_key=$1 AND build_id=$2', [activation.scope_key, request.buildId])
  const identity = sealIdentity.parse(seal.identity), contentScope = identity.contentScope
  const marker = FeatureSealMarkerSchema.parse((build.release_metadata as Record<string, unknown>)?.featureSeal)
  const activationIdentity = z.object({ request: z.object({ scope: z.object({ tenantId: z.string(), clientId: z.string(), siteId: z.string() }), environment: z.enum(['staging', 'production']), hostname: z.string(), buildId: z.string() }), sealDigest: digest }).parse(activation.identity)
  if (
    !scoped(seal, scope)
    || activationIdentity.request.environment !== releaseEnvironment
    || !cmsEqual({ tenantId: contentScope.tenantId, clientId: contentScope.clientId, siteId: contentScope.siteId }, scope)
    || contentScope.businessId !== scope.clientId
    || activation.scope_key !== contentScopeKey(contentScope)
    || seal.scope_key !== activation.scope_key
    || seal.version_id !== identity.versionId
    || build.version_id !== identity.versionId
    || seal.version_digest !== request.versionDigest
    || seal.manifest_digest !== request.manifestDigest
    || seal.seal_digest !== request.sealDigest
    || !cmsEqual(marker, identity.reference)
    || marker.sha256 !== request.sealDigest
    || marker.checkpointDigest !== request.versionDigest
    || identity.recovery.key !== seal.recovery_key
    || identity.recovery.bytes !== seal.recovery_bytes
    || identity.recovery.sha256 !== request.sealDigest
    || identity.runtimeDigest !== env.PAGE_STUDIO_ACTION_RUNTIME_DIGEST
    || identity.runtimeDigest !== 'c67adbab33650675260b6acba1dfa7413207796cb2bc5f56dd24d6eeaf55075e'
    || !cmsEqual(activationIdentity.request.scope, scope)
    || activationIdentity.request.hostname !== request.hostname
    || activationIdentity.request.buildId !== request.buildId
    || activationIdentity.sealDigest !== request.sealDigest
  ) throw publishedFeatureDenied()
  await assertSoleCmsAuthoringScope(db, contentScope)
  const context = await lockCmsContext(db, contentScope)
  if (
    context.state.active_generation !== identity.generation
    || context.state.freeze_digest !== identity.freezeDigest
    || !cmsEqual(context.state.target, identity.target)
  ) throw publishedFeatureDenied()
  return { request, releaseEnvironment, release: { hostname: request.hostname, releaseId: request.releaseId, buildId: request.buildId, versionDigest: request.versionDigest, manifestDigest: request.manifestDigest, sealDigest: request.sealDigest, pointerVersion: epoch, activationId: z.uuid().parse(activation.id) }, contentScope, seal: identity, context }
}
/** Published release admission under the host-configured staging or production binding. No human identity is inherited from publication.
 * Only bounded SQL may run inside work; perform private storage I/O outside. */
async function runPublishedAuthority<T>(purpose: 'projection' | 'action', raw: unknown, env: Record<string, unknown>, expected: PublishedFeatureSnapshot | null, work: (db: PageStudioControlQueryClient, snapshot: PublishedFeatureSnapshot) => Promise<T>, dependencies: CmsGraphDependencies = {}): Promise<T> {
  const request = PublishedFeatureRequestSchema.parse(raw)
  const run = dependencies.runTransaction ?? (callback => transactionWithoutRetry(db => callback(db)))
  try {
    return await run(async (db) => {
      await db.query('SET LOCAL lock_timeout=\'3s\'')
      const snapshot = await locked(db, request, env, purpose)
      if (expected && !cmsEqual(snapshot, expected)) throw publishedFeatureDenied()
      const result = await work(db, snapshot)
      if (!cmsEqual(snapshot, await locked(db, request, env, purpose))) throw publishedFeatureDenied()
      return result
    })
  } catch (error) {
    if (
      typeof error === 'object' && error && 'code' in error && ['55P03', '40P01', '57014'].includes(String(error.code))
    ) throw new PageStudioBusinessContentError('PUBLISHED_FEATURE_BUSY', 503, 'The published feature is changing. Retry the same request.')
    throw error
  }
}
export async function withPublishedFeatureAuthority<T>(raw: unknown, env: Record<string, unknown>, expected: PublishedFeatureSnapshot | null, work: (db: PageStudioControlQueryClient, snapshot: PublishedFeatureSnapshot) => Promise<T>, dependencies: CmsGraphDependencies = {}) {
  return await runPublishedAuthority('projection', raw, env, expected, work, dependencies)
}
/** Public action SQL composition holds the shared quota advisory before package
 * locks. The invocation coordinator must reserve/count quota in this callback. */
export async function withPublishedActionAuthority<T>(raw: unknown, env: Record<string, unknown>, expected: PublishedFeatureSnapshot | null, work: (db: PageStudioControlQueryClient, snapshot: PublishedFeatureSnapshot) => Promise<T>, dependencies: CmsGraphDependencies = {}) {
  return await runPublishedAuthority('action', raw, env, expected, work, dependencies)
}
export async function readPublishedFeatureSnapshot(raw: unknown, env: Record<string, unknown>, dependencies: CmsGraphDependencies = {}) {
  return await withPublishedFeatureAuthority(raw, env, null, async (_db, snapshot) => snapshot, dependencies)
}
