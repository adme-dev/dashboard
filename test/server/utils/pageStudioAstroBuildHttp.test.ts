import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createAstroCompilerBuildIdentity } from '~~/shared/pageStudio/generated/builderGraphVerifier.mjs'
import { hasAstroReleaseConfiguration, resolveAstroBuildServices } from '~~/server/utils/pageStudio/astroBuildHttp'

const checkpoint = vi.hoisted(() => vi.fn())
vi.mock('~~/server/utils/pageStudio/releaseCheckpoint', () => ({ loadApprovedPageStudioReleaseCheckpoint: checkpoint }))

const toolchain = { formatVersion: 1, kind: 'astro-compiler-toolchain', image: `registry.cloudflare.com/test/compiler@sha256:${'a'.repeat(64)}`, hostPolicyDigest: 'b'.repeat(64) }
async function fixture() {
  const context = await createAstroCompilerBuildIdentity({ scope: { tenantId: 'tenant', clientId: 'client', siteId: 'site' }, environment: 'production',
    source: { kind: 'approved-version', versionId: 'version', versionDigest: 'c'.repeat(64), checkpoint: null },
    renderInputDigest: 'c'.repeat(64), featureRecoveryDigest: null }, toolchain)
  const generation = { binding: 'ASTRO_RELEASE_CURRENT', environment: 'production', toolchain, toolchainDigest: context.identity.toolchainDigest, policyDigest: 'd'.repeat(64) }
  const env: Record<string, unknown> = { PAGE_STUDIO_RELEASE_ENVIRONMENT: 'production',
    PAGE_STUDIO_ASTRO_RELEASE_REGISTRY: JSON.stringify({ formatVersion: 1, capability: 'build', generations: [generation] }),
    PAGE_STUDIO_ASTRO_CURRENT_TOOLCHAIN_DIGEST: generation.toolchainDigest,
    PAGE_STUDIO_BUILD: { buildAstroApproved: vi.fn() }, PAGE_STUDIO_DELIVERY: { verifyBuild: vi.fn(), verifyRelease: vi.fn() } }
  const event = { context: { cloudflare: { env } } } as never
  return { event, env, generation }
}
describe('native Astro deployment bindings', () => {
  beforeEach(() => vi.clearAllMocks())
  it('uses the validated registry for current and retained generation selection', async () => {
    const { event, generation } = await fixture()
    const { services, environment } = resolveAstroBuildServices(event)
    expect(environment).toBe('production')
    expect(await services.selectGeneration(environment)).toMatchObject({ toolchain, policyDigest: generation.policyDigest })
    expect(await services.selectGeneration(environment, generation.toolchainDigest)).toMatchObject({ toolchainDigest: generation.toolchainDigest })
    await expect(services.selectGeneration('staging', generation.toolchainDigest)).rejects.toMatchObject({ code: 'BUILD_WORKER_UNAVAILABLE' })
    await expect(services.selectGeneration('production', 'f'.repeat(64))).rejects.toMatchObject({ code: 'BUILD_WORKER_UNAVAILABLE' })
  })
  it('allows retained verification after current selection is retired, without needing source storage', async () => {
    const { event, env, generation } = await fixture()
    delete env.PAGE_STUDIO_ASTRO_CURRENT_TOOLCHAIN_DIGEST
    const { services } = resolveAstroBuildServices(event)
    expect(await services.selectGeneration('production', generation.toolchainDigest)).toMatchObject({ toolchain })
    await expect(services.selectGeneration('production')).rejects.toMatchObject({ code: 'BUILD_WORKER_UNAVAILABLE' })
    expect(checkpoint).not.toHaveBeenCalled()
    await expect(services.loadCheckpoint({ scope: { tenantId: 'tenant', clientId: 'client', siteId: 'site' }, versionId: 'version' }))
      .rejects.toMatchObject({ code: 'BUILD_WORKER_UNAVAILABLE' })
  })
  it.each(['malformed registry', 'missing build binding', 'wrong environment'])('fails closed for %s without opting into legacy', async (scenario) => {
    const { event, env } = await fixture()
    if (scenario === 'malformed registry') env.PAGE_STUDIO_ASTRO_RELEASE_REGISTRY = null
    if (scenario === 'missing build binding') env.PAGE_STUDIO_BUILD = { build: vi.fn() }
    if (scenario === 'wrong environment') env.PAGE_STUDIO_RELEASE_ENVIRONMENT = 'preview'
    expect(hasAstroReleaseConfiguration(event)).toBe(true)
    expect(() => resolveAstroBuildServices(event)).toThrow()
  })
})
