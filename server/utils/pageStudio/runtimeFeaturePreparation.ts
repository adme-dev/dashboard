import { assertRuntimeFeatureAdmission, assertRuntimeFeatureForms } from './runtimeFeatureAdmission'
import { runtimeFeatureDeadline } from './runtimeFeatureDeadline'
import { runtimeFeatureDiagnostics } from './runtimeFeatureDiagnostics'
import { verifyNativeAstroRuntimeRelease } from '~~/shared/pageStudio/generated/builderGraphVerifier.mjs'
import { readApprovedBuildAuthority } from './builds'
import { readAcceptedFeatureRecovery } from './releaseFeatureBuild'
import { featureConflict, readFeaturePublisherSnapshot, withFeaturePublisher, type FeaturePublisher } from './releaseFeatureAuthority'
import { retainRuntimeFeatureRecovery } from './runtimeFeatureRecovery'
import { materializeRuntimeContent, type PreparedRuntimeRelease, type RuntimeContentBucket, type RuntimeRenderer } from './runtimeReleases'
import { derivePageStudioReleaseMetadata } from './releaseMetadata'
import { cmsEqual } from './cmsVisibility'
import type { CmsGraphDependencies } from './cmsGraphCoordinator'
import type { PageStudioPublishingScope } from './publishing'

/** Prepare approved CMS templates without a static build. The activation
 * coordinator fences this result before committing the release and CMS grant.
 * A successful return is a preparation proof, not an activation grant. */
export async function prepareApprovedRuntimeFeature(input: {
  bucket: RuntimeContentBucket
  environment: 'staging' | 'production'
  renderer: RuntimeRenderer
  scope: PageStudioPublishingScope
  versionId: string
}, principal: FeaturePublisher, dependencies: CmsGraphDependencies = {}) {
  const scope = structuredClone(input.scope), renderer = structuredClone(input.renderer)
  const stage = runtimeFeatureDiagnostics()
  const { versionId, environment, bucket } = input
  assertRuntimeFeatureAdmission({ scope, renderer, environment }, principal.request.env)
  const snapshot = await stage('publisher', () => readFeaturePublisherSnapshot(principal, dependencies))
  if (!cmsEqual(scope, { tenantId: snapshot.scope.tenantId, clientId: snapshot.scope.clientId, siteId: snapshot.scope.siteId })) throw featureConflict()
  const configured = principal.request.env.PAGE_STUDIO_RELEASE_ENVIRONMENT
  if (!['staging', 'production'].includes(String(configured)) || (configured === 'staging' && environment !== 'staging')) throw featureConflict()
  const authorityInput = { tenantId: scope.tenantId, siteId: scope.siteId, versionId }
  const readAuthority = () => withFeaturePublisher(snapshot, principal, db => readApprovedBuildAuthority(db, authorityInput), dependencies)
  const authority = await stage('approval', readAuthority)
  if (authority.digest !== snapshot.checkpoint.digest || authority.client_id !== scope.clientId) throw featureConflict()

  const deadline = runtimeFeatureDeadline()
  const retained = await (async () => {
    try {
      const { bundle, manifest } = await stage('recovery', () => deadline.run(() => readAcceptedFeatureRecovery(snapshot, principal)))
      assertRuntimeFeatureForms(manifest as Record<string, unknown>)
      const boundedBucket: RuntimeContentBucket = {
        get: key => deadline.run(async () => {
          const object = await bucket.get(key)
          return object ? { size: object.size, body: object.body, arrayBuffer: () => deadline.run(() => object.arrayBuffer()) } : null
        }),
        put: (key, bytes, options) => deadline.run(() => bucket.put(key, bytes, options))
      }
      const content = await stage('content', () => deadline.run(() => materializeRuntimeContent(boundedBucket, scope, authority.digest, manifest as Record<string, unknown>)))
      const { release, digest } = await verifyNativeAstroRuntimeRelease({
        ...content, delivery: 'runtime', schemaVersion: 1, scope, environment,
        renderer, versionId, versionDigest: authority.digest
      })
      const reference = await stage('seal', () => deadline.run(() => retainRuntimeFeatureRecovery(release, bundle, boundedBucket, deadline.signal)))
      deadline.assert()
      const prepared: PreparedRuntimeRelease = { release, digest, releaseMetadata: derivePageStudioReleaseMetadata(manifest) }
      return {
        prepared,
        feature: {
          approvalId: authority.approval_id, reference,
          application: bundle.application, checkpoint: bundle.checkpoint.id,
          generation: bundle.generation, target: bundle.target,
          freezeDigest: bundle.freezeDigest, runtimeDigest: bundle.runtimeDigest,
          contentScope: snapshot.scope
        }
      }
    } finally { deadline.dispose() }
  })()
  // Remote storage is complete. Revalidate SQL authority under its native
  // transaction before returning preparation; it has a separate latency budget.
  await stage('approval', async () => {
    if (!cmsEqual(authority, await readAuthority())) throw featureConflict()
  })
  assertRuntimeFeatureAdmission({ scope, renderer, environment }, principal.request.env)
  return retained
}
