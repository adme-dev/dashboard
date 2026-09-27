import { describe, expect, it } from 'vitest'
import { createNativeAstroRuntimeFeatureReference, verifyNativeAstroRuntimeFeatureRecovery, verifyNativeAstroRuntimeRelease, nativeAstroRuntimeContentPrefix } from '../../shared/pageStudio/generated/builderGraphVerifier.mjs'
import { collectionCanonical } from '../../shared/pageStudio/collectionApi'
import golden from '../fixtures/pageStudioReleaseRecovery.json'

async function fixture() {
  const bundle = structuredClone(golden.bundle)
  const { tenantId, clientId, siteId } = bundle.contentScope
  const scope = { tenantId, clientId, siteId }
  const { release } = await verifyNativeAstroRuntimeRelease({
    delivery: 'runtime', environment: 'production', schemaVersion: 1,
    scope, versionId: 'version_a', versionDigest: bundle.checkpoint.sha256,
    snapshot: {
      bytes: new TextEncoder().encode(bundle.checkpoint.bytes).byteLength,
      contentType: 'application/json; charset=utf-8',
      key: `${nativeAstroRuntimeContentPrefix(scope)}/versions/${bundle.checkpoint.sha256}/site.json`,
      sha256: bundle.checkpoint.sha256
    },
    images: [], redirects: {},
    renderer: { name: 'astro-runtime', generation: 'renderer_a', assetsDigest: 'a'.repeat(64), codeDigest: 'b'.repeat(64) }
  })
  const reference = await createNativeAstroRuntimeFeatureReference(release, bundle)
  return { bundle, release, reference }
}

describe('native runtime feature byte identity', () => {
  it('retains the same immutable recovery as the static path, with runtime identity', async () => {
    const { bundle, release, reference } = await fixture()
    const proof = await verifyNativeAstroRuntimeFeatureRecovery(reference, release, collectionCanonical(bundle))
    expect(proof.digest).toBe(golden.digest)
    expect(proof.bundle).toEqual(bundle)
    expect(proof.reference).toEqual(reference)
    expect(reference).not.toHaveProperty('buildId')
  })
  it('rejects a different renderer and changed artifact bytes', async () => {
    const { bundle, release, reference } = await fixture()
    await expect(verifyNativeAstroRuntimeFeatureRecovery(reference, { ...release, renderer: { ...release.renderer, generation: 'other' } }, collectionCanonical(bundle))).rejects.toThrow()
    bundle.artifacts[0]!.bytes += ' '
    await expect(verifyNativeAstroRuntimeFeatureRecovery(reference, release, collectionCanonical(bundle))).rejects.toThrow()
  })
  it('cannot substitute publication authority or record snapshots into the reference', async () => {
    const { bundle, release, reference } = await fixture()
    await expect(verifyNativeAstroRuntimeFeatureRecovery({ ...reference, activationId: 'grant' }, release, collectionCanonical(bundle))).rejects.toThrow()
    await expect(createNativeAstroRuntimeFeatureReference(release, { ...bundle, records: [] })).rejects.toThrow()
  })
})
