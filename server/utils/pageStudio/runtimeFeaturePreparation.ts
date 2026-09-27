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

/** Prepare approved CMS templates without a static build. This is deliberately
 * not routed from Publish until runtime feature activation/current projection
 * exists. A successful return is a preparation proof, not an activation grant. */
export async function prepareApprovedRuntimeFeature(input: {
  bucket: RuntimeContentBucket
  environment: 'staging' | 'production'
  renderer: RuntimeRenderer
  scope: PageStudioPublishingScope
  versionId: string
}, principal: FeaturePublisher, dependencies: CmsGraphDependencies = {}) {
  const scope = structuredClone(input.scope), renderer = structuredClone(input.renderer)
  const { versionId, environment, bucket } = input
  const snapshot = await readFeaturePublisherSnapshot(principal, dependencies)
  if (!cmsEqual(scope, { tenantId: snapshot.scope.tenantId, clientId: snapshot.scope.clientId, siteId: snapshot.scope.siteId })) throw featureConflict()
  const configured = principal.request.env.PAGE_STUDIO_RELEASE_ENVIRONMENT
  if (!['staging', 'production'].includes(String(configured)) || (configured === 'staging' && environment !== 'staging')) throw featureConflict()
  const authorityInput = { tenantId: scope.tenantId, siteId: scope.siteId, versionId }
  const readAuthority = () => withFeaturePublisher(snapshot, principal, db => readApprovedBuildAuthority(db, authorityInput), dependencies)
  const authority = await readAuthority()
  if (authority.digest !== snapshot.checkpoint.digest || authority.client_id !== scope.clientId) throw featureConflict()

  const { bundle, manifest } = await readAcceptedFeatureRecovery(snapshot, principal)
  const content = await materializeRuntimeContent(bucket, scope, authority.digest, manifest as Record<string, unknown>)
  const { release, digest } = await verifyNativeAstroRuntimeRelease({
    ...content, delivery: 'runtime', schemaVersion: 1, scope, environment,
    renderer, versionId, versionDigest: authority.digest
  })
  const reference = await retainRuntimeFeatureRecovery(release, bundle, bucket)
  // Storage work stays outside SQL locks. Revocation or a different approval
  // during any read/write invalidates the prepared result without publishing it.
  if (!cmsEqual(authority, await readAuthority())) throw featureConflict()
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
}
