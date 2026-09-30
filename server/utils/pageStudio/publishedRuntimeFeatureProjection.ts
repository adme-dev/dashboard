import { verifyNativeAstroRuntimeFeatureRecovery } from '~~/shared/pageStudio/generated/builderGraphVerifier.mjs'
import { collectionCanonical } from '~~/shared/pageStudio/collectionApi'
import { readPublishedFeatureRecovery, projectPublishedFeaturePage } from './publishedFeatureProjection'
import { readPublishedRuntimeFeatureSnapshot, withPublishedRuntimeFeatureAuthority } from './publishedRuntimeFeatureAuthority'
import type { CmsGraphDependencies } from './cmsGraphCoordinator'
import { runtimeFeatureDiagnostics } from './runtimeFeatureDiagnostics'

/** Reuses static field/record projection with Astro release identity and current
 * epoch authority. Sealed records are never restored by publication or rollback. */
export async function readPublishedRuntimeFeaturePage(raw: unknown, env: Record<string, unknown>, dependencies: CmsGraphDependencies = {}) {
  const measure = runtimeFeatureDiagnostics()
  const snapshot = await measure('published-authority', () => readPublishedRuntimeFeatureSnapshot(raw, env, dependencies))
  const recovered = await measure('published-recovery', async () => {
    const value = await readPublishedFeatureRecovery(snapshot, env)
    await verifyNativeAstroRuntimeFeatureRecovery(snapshot.seal.reference, snapshot.runtimeRelease, collectionCanonical(value.bundle))
    return value
  })
  return await measure('published-projection', () => projectPublishedFeaturePage(snapshot, recovered, env,
    work => withPublishedRuntimeFeatureAuthority(snapshot.request, env, snapshot, work, dependencies)))
}
