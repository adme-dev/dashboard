import { generateKeyPairSync } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'

import {
  authorizePageStudioRuntimeDraftPreview,
  pageStudioRuntimeDraftHostname,
  type PageStudioDeliveryQueryOne,
  resolvePageStudioReleaseHost
} from '~~/server/utils/pageStudio/delivery'
import { signPageStudioSessionToken, type PageStudioSessionClaims } from '~~/server/utils/pageStudio/sessions'
import { verifyNativeAstroRuntimeRelease } from '~~/shared/pageStudio/generated/builderGraphVerifier.mjs'

const ISSUER = 'https://preview.agency-dashboard-6cm.pages.dev'
const SUFFIX = 'preview.xeroflowpages.com'
const SCOPE = { clientId: '22222222-2222-4222-8222-222222222222', siteId: '11111111-1111-4111-8111-111111111111', tenantId: 'tenant-alpha' }
const DIGEST = 'c'.repeat(64)

async function runtimeRow(environment: 'staging' | 'production' = 'production') {
  const prefix = `tenants/${SCOPE.tenantId}/clients/${SCOPE.clientId}/sites/${SCOPE.siteId}/runtime`
  const { digest, release } = await verifyNativeAstroRuntimeRelease({
    delivery: 'runtime', environment, images: [], redirects: {},
    renderer: { assetsDigest: 'a'.repeat(64), codeDigest: 'b'.repeat(64), generation: 'renderer_one', name: 'astro-runtime' },
    schemaVersion: 1, scope: SCOPE,
    snapshot: { bytes: 10, contentType: 'application/json; charset=utf-8', key: `${prefix}/versions/${DIGEST}/site.json`, sha256: DIGEST },
    versionDigest: DIGEST, versionId: '77777777-7777-4777-8777-777777777777'
  })
  return {
    client_id: SCOPE.clientId, environment, release_id: '66666666-6666-4666-8666-666666666666',
    runtime_release: release, runtime_release_digest: digest, site_id: SCOPE.siteId, tenant_id: SCOPE.tenantId
  }
}

describe('runtime public host resolution', () => {
  it('returns the verified runtime reference for a runtime release', async () => {
    const row = await runtimeRow()
    const queryOne = vi.fn(async () => row) as PageStudioDeliveryQueryOne
    const resolved = await resolvePageStudioReleaseHost('www.site.example', { queryOne })
    expect(resolved).toEqual({
      hostname: 'www.site.example',
      release: { delivery: 'runtime', environment: 'production', release: row.runtime_release, releaseDigest: row.runtime_release_digest, releaseId: row.release_id }
    })
    const [sql] = (queryOne as unknown as { mock: { calls: [string][] } }).mock.calls[0]!
    expect(sql).toContain('site.delivery_mode = \'runtime\'')
  })

  it('fails closed when the stored reference does not match its digest or environment', async () => {
    const row = await runtimeRow()
    await expect(resolvePageStudioReleaseHost('www.site.example', { queryOne: (async () => ({ ...row, runtime_release_digest: 'f'.repeat(64) })) as PageStudioDeliveryQueryOne })).rejects.toThrow()
    await expect(resolvePageStudioReleaseHost('www.site.example', { queryOne: (async () => ({ ...row, environment: 'staging' })) as PageStudioDeliveryQueryOne })).rejects.toThrow()
  })
})

describe('runtime draft preview authorization', () => {
  const { privateKey, publicKey } = (() => {
    const pair = generateKeyPairSync('ec', { namedCurve: 'P-256' })
    return {
      privateKey: pair.privateKey.export({ format: 'pem', type: 'pkcs8' }).toString(),
      publicKey: pair.publicKey.export({ format: 'pem', type: 'spki' }).toString()
    }
  })()
  const claims = (overrides: Partial<PageStudioSessionClaims> = {}): PageStudioSessionClaims => ({
    capabilities: ['workspace:create', 'workspace:preview'], clientId: SCOPE.clientId, expiresAt: 1_900, issuedAt: 1_000,
    nonce: '44444444-4444-4444-8444-444444444444', role: 'agency', siteId: SCOPE.siteId, tenantId: SCOPE.tenantId,
    userId: '33333333-3333-4333-8333-333333333333', ...overrides
  })
  const hostname = pageStudioRuntimeDraftHostname(SCOPE.siteId, SUFFIX)
  const draft = { checkpointId: 'checkpoint_a', images: [], redirects: {}, scope: SCOPE, snapshot: {} as never, versionDigest: DIGEST }
  const setup = async (row: unknown, sessionClaims = claims()) => {
    const token = await signPageStudioSessionToken(sessionClaims, privateKey, ISSUER)
    const queryOne = vi.fn(async () => row) as PageStudioDeliveryQueryOne
    const resolveDraft = vi.fn(async () => draft)
    const authorize = (host = hostname) => authorizePageStudioRuntimeDraftPreview({ hostname: host, token }, {
      bucket: {} as never, currentDate: new Date(1_001_000), issuer: ISSUER, previewSuffix: SUFFIX, publicKey, queryOne, resolveDraft
    })
    return { authorize, queryOne, resolveDraft }
  }

  it('returns the current saved checkpoint for the site draft host', async () => {
    const f = await setup({ checkpoint_digest: DIGEST, checkpoint_id: 'checkpoint_a', object_key: 'k' })
    await expect(f.authorize()).resolves.toEqual({ draft, hostname })
    expect(f.resolveDraft).toHaveBeenCalledWith(expect.objectContaining({ checkpointId: 'checkpoint_a', digest: DIGEST, scope: SCOPE }))
    const [sql] = (f.queryOne as unknown as { mock: { calls: [string][] } }).mock.calls[0]!
    expect(sql).toContain('site.delivery_mode = \'runtime\'')
    expect(sql).toContain('session.revoked_at IS NULL')
  })

  it('refuses another site\'s draft host before querying', async () => {
    const f = await setup({ checkpoint_digest: DIGEST, checkpoint_id: 'checkpoint_a', object_key: 'k' })
    await expect(f.authorize(pageStudioRuntimeDraftHostname('99999999-9999-4999-8999-999999999999', SUFFIX))).resolves.toBeNull()
    expect(f.queryOne).not.toHaveBeenCalled()
  })

  it('returns nothing for revoked, expired or non-runtime sessions', async () => {
    const f = await setup(null)
    await expect(f.authorize()).resolves.toBeNull()
    expect(f.resolveDraft).not.toHaveBeenCalled()
  })

  it('rejects credentials without preview capability', async () => {
    const f = await setup({ checkpoint_digest: DIGEST, checkpoint_id: 'checkpoint_a', object_key: 'k' }, claims({ capabilities: ['workspace:create'] }))
    await expect(f.authorize()).rejects.toMatchObject({ code: 'PREVIEW_FORBIDDEN' })
  })
})
