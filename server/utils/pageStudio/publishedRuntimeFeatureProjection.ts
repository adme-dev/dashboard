import { verifyNativeAstroRuntimeFeatureRecovery } from '~~/shared/pageStudio/generated/builderGraphVerifier.mjs'
import { collectionCanonical } from '~~/shared/pageStudio/collectionApi'
import { readPublishedFeatureRecovery, projectPublishedFeaturePage } from './publishedFeatureProjection'
import { readPublishedRuntimeFeatureSnapshot, withPublishedRuntimeFeatureAuthority } from './publishedRuntimeFeatureAuthority'
import type { CmsGraphDependencies } from './cmsGraphCoordinator'

/** Reuses static field/record projection with Astro release identity and current
 * epoch authority. Sealed records are never restored by publication or rollback. */
export async function readPublishedRuntimeFeaturePage(raw: unknown, env: Record<string, unknown>, dependencies: CmsGraphDependencies = {}) {
  const snapshot = await readPublishedRuntimeFeatureSnapshot(raw, env, dependencies)
  const recovered = await readPublishedFeatureRecovery(snapshot, env)
  await verifyNativeAstroRuntimeFeatureRecovery(snapshot.seal.reference, snapshot.runtimeRelease, collectionCanonical(recovered.bundle))
  return await projectPublishedFeaturePage(snapshot, recovered, env,
    work => withPublishedRuntimeFeatureAuthority(snapshot.request, env, snapshot, work, dependencies))
}
