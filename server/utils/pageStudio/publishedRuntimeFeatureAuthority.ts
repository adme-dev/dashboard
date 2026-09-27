import { z } from 'zod'
import { transactionWithoutRetry } from '~~/server/utils/db'
import { PageStudioContentScopeSchema } from '~~/shared/pageStudio/businessContent'
import { CmsStorageTargetSchema, contentScopeKey } from '~~/shared/pageStudio/cmsManaged'
import { verifyNativeAstroRuntimeRelease } from '~~/shared/pageStudio/generated/builderGraphVerifier.mjs'
import { PageStudioHostnameSchema } from './delivery'
import { PageStudioBusinessContentError } from './businessContent'
import { cmsEqual, lockCmsContext } from './cmsVisibility'
import { assertSoleCmsAuthoringScope, type CmsGraphDependencies } from './cmsGraphCoordinator'
import { lockPublishedFeatureSite, publishedFeatureDenied } from './publishedFeatureAuthority'
import type { PageStudioControlQueryClient } from './controlStore'

const digest = z.string().regex(/^[a-f0-9]{64}$/)
const id = z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/)
export const PublishedRuntimeFeatureRequestSchema = z.object({
  hostname: PageStudioHostnameSchema, releaseId: z.uuid(), releaseDigest: digest,
  versionDigest: digest, sealDigest: digest, activationId: z.uuid(),
  pointerVersion: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  pageRoute: z.string().max(240).regex(/^\/(?:[a-z0-9][a-z0-9_-]*(?:\/[a-z0-9][a-z0-9_-]*)*)?$/)
}).strict()
export const RuntimeFeatureSealIdentitySchema = z.object({
  approvalId: id,
  reference: z.object({ formatVersion: z.literal(1), releaseDigest: digest, recovery: z.object({
    key: z.string().regex(/^builder-recovery\/v1\/[a-f0-9]{64}\/[a-f0-9]{64}\/[a-f0-9]{64}\.json$/),
    bytes: z.number().int().min(1).max(8_000_000), sha256: digest
  }).strict() }).strict(),
  application: z.object({ id, digest }).strict(), checkpoint: id,
  generation: z.uuid(), target: CmsStorageTargetSchema, freezeDigest: digest,
  runtimeDigest: digest, contentScope: PageStudioContentScopeSchema
}).strict()
export type PublishedRuntimeFeatureRequest = z.infer<typeof PublishedRuntimeFeatureRequestSchema>
async function one(db: PageStudioControlQueryClient, sql: string, params: unknown[]) {
  const rows = (await db.query<Record<string, unknown>>(sql, params)).rows
  if (rows.length !== 1) throw publishedFeatureDenied()
  return rows[0]!
}
async function locked(db: PageStudioControlQueryClient, request: PublishedRuntimeFeatureRequest, env: Record<string, unknown>) {
  const { scope, releaseEnvironment, epoch } = await lockPublishedFeatureSite(db, request, env)
  if (epoch !== request.pointerVersion) throw publishedFeatureDenied()
  const release = await one(db, `SELECT * FROM page_studio_releases WHERE tenant_id=$1 AND client_id=$2 AND site_id=$3 AND id=$4 FOR SHARE NOWAIT`,
    [scope.tenantId, scope.clientId, scope.siteId, request.releaseId])
  const verified = await verifyNativeAstroRuntimeRelease(release.runtime_release)
  if (verified.digest !== request.releaseDigest || release.runtime_release_digest !== verified.digest
    || release.environment !== releaseEnvironment || release.normalized_hostname !== request.hostname
    || verified.release.environment !== releaseEnvironment || !cmsEqual(verified.release.scope, scope)
    || release.runtime_version_id !== verified.release.versionId || release.runtime_version_digest !== request.versionDigest
    || verified.release.versionDigest !== request.versionDigest || release.build_id !== null) throw publishedFeatureDenied()
  const activation = await one(db, `SELECT * FROM page_studio_runtime_feature_activations WHERE environment=$1 AND hostname=$2 AND pointer_version=$3 FOR SHARE NOWAIT`,
    [releaseEnvironment, request.hostname, epoch])
  if (activation.id !== request.activationId || activation.release_id !== request.releaseId
    || activation.state !== 'enabled' || activation.revoked_at !== null) throw publishedFeatureDenied()
  const seal = await one(db, 'SELECT * FROM page_studio_runtime_feature_seals WHERE release_id=$1', [request.releaseId])
  const identity = RuntimeFeatureSealIdentitySchema.parse(seal.identity), contentScope = identity.contentScope
  const activated = z.object({ request: z.object({ scope: z.object({ tenantId: z.string(), clientId: z.string(), siteId: z.string() }),
    environment: z.enum(['staging', 'production']), hostname: z.string() }) }).parse(activation.identity)
  if (seal.tenant_id !== scope.tenantId || seal.client_id !== scope.clientId || seal.site_id !== scope.siteId
    || seal.release_digest !== request.releaseDigest || identity.reference.releaseDigest !== request.releaseDigest
    || identity.reference.recovery.sha256 !== request.sealDigest || seal.scope_key !== contentScopeKey(contentScope)
    || !cmsEqual({ tenantId: contentScope.tenantId, clientId: contentScope.clientId, siteId: contentScope.siteId }, scope)
    || contentScope.businessId !== scope.clientId || !cmsEqual(activated.request.scope, scope)
    || activated.request.environment !== releaseEnvironment || activated.request.hostname !== request.hostname
    || identity.runtimeDigest !== env.PAGE_STUDIO_ACTION_RUNTIME_DIGEST
    || identity.runtimeDigest !== 'c67adbab33650675260b6acba1dfa7413207796cb2bc5f56dd24d6eeaf55075e') throw publishedFeatureDenied()
  await assertSoleCmsAuthoringScope(db, contentScope)
  const context = await lockCmsContext(db, contentScope)
  if (context.state.active_generation !== identity.generation || context.state.freeze_digest !== identity.freezeDigest
    || !cmsEqual(context.state.target, identity.target)) throw publishedFeatureDenied()
  const { pageRoute: _pageRoute, ...publicRelease } = request
  return { request, releaseEnvironment, release: publicRelease, contentScope,
    seal: { ...identity, recovery: identity.reference.recovery }, context, runtimeRelease: verified.release }
}
export type PublishedRuntimeFeatureSnapshot = Awaited<ReturnType<typeof locked>>
/** Current publication is the principal; the publisher's login is never borrowed. */
export async function withPublishedRuntimeFeatureAuthority<T>(raw: unknown, env: Record<string, unknown>, expected: PublishedRuntimeFeatureSnapshot | null,
  work: (db: PageStudioControlQueryClient, snapshot: PublishedRuntimeFeatureSnapshot) => Promise<T>, dependencies: CmsGraphDependencies = {}) {
  const request = PublishedRuntimeFeatureRequestSchema.parse(raw)
  const run = dependencies.runTransaction ?? (callback => transactionWithoutRetry(db => callback(db)))
  try {
    return await run(async (db) => {
      await db.query('SET LOCAL lock_timeout=\'3s\'')
      const snapshot = await locked(db, request, env)
      if (expected && !cmsEqual(snapshot, expected)) throw publishedFeatureDenied()
      const result = await work(db, snapshot)
      if (!cmsEqual(snapshot, await locked(db, request, env))) throw publishedFeatureDenied()
      return result
    })
  } catch (error) {
    if (typeof error === 'object' && error && 'code' in error && ['55P03', '40P01', '57014'].includes(String(error.code)))
      throw new PageStudioBusinessContentError('PUBLISHED_FEATURE_BUSY', 503, 'The published feature is changing. Retry the same request.')
    throw error
  }
}
export async function readPublishedRuntimeFeatureSnapshot(raw: unknown, env: Record<string, unknown>, dependencies: CmsGraphDependencies = {}) {
  return await withPublishedRuntimeFeatureAuthority(raw, env, null, async (_db, snapshot) => snapshot, dependencies)
}
