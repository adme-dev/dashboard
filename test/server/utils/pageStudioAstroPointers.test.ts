import { generateKeyPairSync } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { createAstroCompilerBuildIdentity } from '~~/shared/pageStudio/generated/builderGraphVerifier.mjs'
import { getPageStudioBuildPointer, getPageStudioReleasePointer } from '~~/server/utils/pageStudio/publishing'
import { authorizePageStudioPreview, resolvePageStudioReleaseHost } from '~~/server/utils/pageStudio/delivery'
import { signPageStudioSessionToken } from '~~/server/utils/pageStudio/sessions'

const scope = { tenantId: 'tenant-alpha', clientId: '22222222-2222-4222-8222-222222222222', siteId: '11111111-1111-4111-8111-111111111111' }
const versionId = '33333333-3333-4333-8333-333333333333'
const releaseId = '44444444-4444-4444-8444-444444444444'
async function fixture() {
  const toolchain = { formatVersion: 1, kind: 'astro-compiler-toolchain', image: `registry.cloudflare.com/test/compiler@sha256:${'a'.repeat(64)}`, hostPolicyDigest: 'b'.repeat(64) }
  const context = await createAstroCompilerBuildIdentity({
    scope, environment: 'production', featureRecoveryDigest: null, renderInputDigest: 'c'.repeat(64),
    source: { kind: 'approved-version', versionId, versionDigest: 'c'.repeat(64), checkpoint: null }
  }, toolchain)
  const artifactDigest = 'd'.repeat(64)
  const prefix = `tenants/${scope.tenantId}/clients/${scope.clientId}/sites/${scope.siteId}/astro/production/${context.buildId}/${artifactDigest}`
  const receipt = {
    artifactPrefix: prefix, buildId: context.buildId, renderer: 'astro', success: true,
    versionDigest: 'c'.repeat(64), manifestDigest: 'e'.repeat(64), manifestKey: `${prefix}/release-manifest.json`,
    validationKey: `${prefix}/validation-report.json`, astro: { context, manifestDigest: artifactDigest, policyDigest: 'f'.repeat(64) }
  }
  const row = {
    renderer: 'astro', build_id: context.buildId, build_version_id: versionId, version_digest: receipt.versionDigest,
    artifact_prefix: prefix, manifest_key: receipt.manifestKey, manifest_digest: receipt.manifestDigest,
    validation_report_key: receipt.validationKey, build_identity: context.identity, build_identity_digest: context.identityDigest,
    compiler_toolchain: toolchain, astro_release_receipt: receipt, environment: 'production', release_id: releaseId,
    tenant_id: scope.tenantId, client_id: scope.clientId, site_id: scope.siteId
  }
  const pointer = { artifactPrefix: prefix, buildId: context.buildId, manifestDigest: receipt.manifestDigest,
    manifestKey: receipt.manifestKey, scope, versionDigest: receipt.versionDigest, astro: receipt.astro }
  return { row, pointer }
}

describe('retained Astro native pointers', () => {
  it('preserves the same verified reference through build, release and public-host readers', async () => {
    const f = await fixture()
    const queryOne = vi.fn().mockResolvedValue(f.row)
    expect(await getPageStudioBuildPointer(scope, f.pointer.buildId, { queryOne })).toEqual(f.pointer)
    const release = { ...f.pointer, environment: 'production', releaseId }
    expect(await getPageStudioReleasePointer(scope, releaseId, { queryOne })).toEqual(release)
    expect(await resolvePageStudioReleaseHost('customer.example', { queryOne })).toEqual({ hostname: 'customer.example', release })
  })
  it('preserves the production identity when viewed through an authorized preview hostname', async () => {
    const f = await fixture()
    const keys = generateKeyPairSync('ec', { namedCurve: 'P-256' })
    const issuer = 'https://studio.example'
    const token = await signPageStudioSessionToken({
      ...scope, userId: versionId, role: 'agency', nonce: releaseId,
      capabilities: ['workspace:preview'], issuedAt: 1000, expiresAt: 1900
    }, keys.privateKey.export({ format: 'pem', type: 'pkcs8' }).toString(), issuer)
    const result = await authorizePageStudioPreview({ hostname: 'review.preview.example', token }, {
      issuer, publicKey: keys.publicKey.export({ format: 'pem', type: 'spki' }).toString(),
      currentDate: new Date(1500 * 1000), queryOne: vi.fn().mockResolvedValue({ ...f.row, environment: 'preview' })
    })
    expect(result?.release).toEqual({ ...f.pointer, environment: 'preview', releaseId })
    expect(result?.release.astro?.context.identity.environment).toBe('production')
  })
  it.each(['scope', 'toolchain', 'receipt', 'digest', 'version', 'validationKey', 'renderer'])(
    'rejects inconsistent retained %s instead of returning a legacy fallback', async (change) => {
      const f = await fixture()
      if (change === 'scope') f.row.build_identity.scope.clientId = 'foreign'
      if (change === 'toolchain') f.row.compiler_toolchain.hostPolicyDigest = '9'.repeat(64)
      if (change === 'receipt') Object.assign(f.row, { astro_release_receipt: null })
      if (change === 'digest') f.row.manifest_digest = '9'.repeat(64)
      if (change === 'version') f.row.build_version_id = releaseId
      if (change === 'validationKey') f.row.validation_report_key += '.foreign'
      if (change === 'renderer') f.row.renderer = 'legacy'
      await expect(getPageStudioBuildPointer(scope, f.pointer.buildId, { queryOne: vi.fn().mockResolvedValue(f.row) }))
        .rejects.toMatchObject({ code: 'RELEASE_RECORD_INVALID' })
    }
  )
  it('rejects a retained production build relabeled as a staging release or host', async () => {
    const f = await fixture()
    const queryOne = vi.fn().mockResolvedValue({ ...f.row, environment: 'staging' })
    await expect(getPageStudioReleasePointer(scope, releaseId, { queryOne })).rejects.toMatchObject({ code: 'RELEASE_RECORD_INVALID' })
    await expect(resolvePageStudioReleaseHost('customer.example', { queryOne })).rejects.toMatchObject({ code: 'RELEASE_RECORD_INVALID' })
  })
})
