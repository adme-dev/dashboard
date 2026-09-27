import { z } from 'zod'
import { verifyNativeAstroRuntimeFeatureRecovery } from '~~/shared/pageStudio/generated/builderGraphVerifier.mjs'
import { collectionCanonical } from '~~/shared/pageStudio/collectionApi'
import { readPublishedFeatureRecovery } from './publishedFeatureProjection'
import { publishedFeatureDenied } from './publishedFeatureAuthority'
import { readPublishedRuntimeFeatureSnapshot, withPublishedRuntimeFeatureAuthority } from './publishedRuntimeFeatureAuthority'
import type { CmsGraphDependencies } from './cmsGraphCoordinator'

/** Ordinary lead forms remain available on CMS sites. Generated action forms
 * are deliberately excluded until their runtime invocation path is admitted. */
export async function readPublishedRuntimeFeatureForms(raw: unknown, env: Record<string, unknown>, dependencies: CmsGraphDependencies = {}) {
  const snapshot = await readPublishedRuntimeFeatureSnapshot(raw, env, dependencies)
  if (snapshot.releaseEnvironment !== 'production') throw publishedFeatureDenied()
  const recovered = await readPublishedFeatureRecovery(snapshot, env)
  await verifyNativeAstroRuntimeFeatureRecovery(snapshot.seal.reference, snapshot.runtimeRelease, collectionCanonical(recovered.bundle))
  // Full form semantics are already checked by shared checkpoint verification.
  const site = z.object({ id: z.string(), pages: z.array(z.object({ id: z.string(), route: z.string(), visibility: z.string(),
    forms: z.array(z.object({ submission: z.unknown().optional() }).passthrough()) })) }).parse(recovered.checkpoint)
  const runtime = { schemaVersion: 1, siteId: site.id, forms: site.pages.filter(page => page.visibility === 'public')
    .flatMap(page => page.forms.filter(form => !form.submission).map(form => ({ form, pageId: page.id, route: page.route }))) }
  if (new TextEncoder().encode(collectionCanonical(runtime)).length > 512 * 1024) throw publishedFeatureDenied()
  return await withPublishedRuntimeFeatureAuthority(snapshot.request, env, snapshot, async () => ({ release: snapshot.release, runtime }), dependencies)
}
