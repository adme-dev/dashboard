import { generateKeyPairSync } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'

import {
  authorizePageStudioPreview,
  type PageStudioDeliveryQueryOne,
  resolvePageStudioReleaseHost
} from '~~/server/utils/pageStudio/delivery'
import {
  signPageStudioSessionToken,
  type PageStudioSessionClaims
} from '~~/server/utils/pageStudio/sessions'

const ISSUER = 'https://preview.agency-dashboard-6cm.pages.dev'
const HOSTNAME = 'site.preview.staging.pages.xeroflow.com'
const SCOPE = {
  clientId: '22222222-2222-4222-8222-222222222222',
  siteId: '11111111-1111-4111-8111-111111111111',
  tenantId: 'tenant-alpha'
}
const USER_ID = '33333333-3333-4333-8333-333333333333'

function signingKeys() {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
  return {
    privateKey: privateKey.export({ format: 'pem', type: 'pkcs8' }).toString(),
    publicKey: publicKey.export({ format: 'pem', type: 'spki' }).toString()
  }
}

function claims(overrides: Partial<PageStudioSessionClaims> = {}): PageStudioSessionClaims {
  return {
    capabilities: ['workspace:create', 'workspace:preview'],
    clientId: SCOPE.clientId,
    expiresAt: 1_900,
    issuedAt: 1_000,
    nonce: '44444444-4444-4444-8444-444444444444',
    role: 'agency',
    siteId: SCOPE.siteId,
    tenantId: SCOPE.tenantId,
    userId: USER_ID,
    ...overrides
  }
}

const releaseRow = {
  artifact_prefix: `tenants/${SCOPE.tenantId}/clients/${SCOPE.clientId}/sites/${SCOPE.siteId}/builds/${'a'.repeat(64)}`,
  build_id: `build_${'a'.repeat(32)}`,
  environment: 'preview' as const,
  manifest_digest: 'b'.repeat(64),
  manifest_key: `tenants/${SCOPE.tenantId}/clients/${SCOPE.clientId}/sites/${SCOPE.siteId}/builds/${'a'.repeat(64)}/release-manifest.json`,
  release_id: '55555555-5555-4555-8555-555555555555',
  version_digest: 'a'.repeat(64)
}

const publicReleaseRow = {
  ...releaseRow,
  client_id: SCOPE.clientId,
  environment: 'production' as const,
  release_id: '66666666-6666-4666-8666-666666666666',
  site_id: SCOPE.siteId,
  tenant_id: SCOPE.tenantId
}

describe('Page Studio public host resolution', () => {
  it('resolves an exact active public hostname to its succeeded immutable build', async () => {
    const queryOne = vi.fn(async () => publicReleaseRow) as PageStudioDeliveryQueryOne

    await expect(resolvePageStudioReleaseHost(`  ${HOSTNAME.toUpperCase()}  `, {
      queryOne
    })).resolves.toEqual({
      hostname: HOSTNAME,
      release: {
        artifactPrefix: publicReleaseRow.artifact_prefix,
        buildId: publicReleaseRow.build_id,
        environment: 'production',
        manifestDigest: publicReleaseRow.manifest_digest,
        manifestKey: publicReleaseRow.manifest_key,
        releaseId: publicReleaseRow.release_id,
        scope: SCOPE,
        versionDigest: publicReleaseRow.version_digest
      }
    })

    expect(queryOne).toHaveBeenCalledOnce()
    const [sql, params] = queryOne.mock.calls[0]!
    expect(sql).toContain('pointer.environment IN (\'staging\', \'production\')')
    expect(sql).toContain('pointer.environment = \'staging\' AND site.status IN (\'draft\', \'active\')')
    expect(sql).toContain('pointer.environment = \'production\' AND site.status = \'active\'')
    expect(sql).toContain('build.state = \'succeeded\'')
    expect(params).toEqual([HOSTNAME])
  })

  it('returns no release for an unknown, inactive, or preview-only hostname', async () => {
    const queryOne = vi.fn(async () => null) as PageStudioDeliveryQueryOne

    await expect(resolvePageStudioReleaseHost(HOSTNAME, { queryOne })).resolves.toBeNull()
  })

  it('rejects malformed hostnames before querying', async () => {
    const queryOne = vi.fn(async () => publicReleaseRow) as PageStudioDeliveryQueryOne

    await expect(resolvePageStudioReleaseHost('localhost', { queryOne }))
      .rejects.toMatchObject({ code: 'PUBLIC_HOST_INVALID', statusCode: 400 })
    expect(queryOne).not.toHaveBeenCalled()
  })
})

describe('Page Studio preview authorization', () => {
  it('verifies the signed session, its ledger row, and the exact active preview hostname', async () => {
    const keys = signingKeys()
    const session = claims()
    const token = await signPageStudioSessionToken(session, keys.privateKey, ISSUER)
    const queryOne = vi.fn(async () => releaseRow) as PageStudioDeliveryQueryOne

    await expect(authorizePageStudioPreview({ hostname: HOSTNAME, token }, {
      currentDate: new Date(1_001_000),
      issuer: ISSUER,
      publicKey: keys.publicKey,
      queryOne
    })).resolves.toEqual({
      hostname: HOSTNAME,
      release: {
        artifactPrefix: releaseRow.artifact_prefix,
        buildId: releaseRow.build_id,
        environment: 'preview',
        manifestDigest: releaseRow.manifest_digest,
        manifestKey: releaseRow.manifest_key,
        releaseId: releaseRow.release_id,
        scope: SCOPE,
        versionDigest: releaseRow.version_digest
      }
    })

    expect(queryOne).toHaveBeenCalledOnce()
    const [, params] = queryOne.mock.calls[0]!
    expect(params).toEqual([
      session.nonce,
      session.tenantId,
      session.clientId,
      session.siteId,
      session.userId,
      session.role,
      JSON.stringify(session.capabilities),
      session.issuedAt,
      session.expiresAt,
      HOSTNAME
    ])
    expect(params).not.toContain(token)
  })

  it('rejects invalid signatures and sessions without preview capability before querying', async () => {
    const keys = signingKeys()
    const otherKeys = signingKeys()
    const queryOne = vi.fn(async () => releaseRow) as PageStudioDeliveryQueryOne
    const wrongSignature = await signPageStudioSessionToken(claims(), otherKeys.privateKey, ISSUER)

    await expect(authorizePageStudioPreview({ hostname: HOSTNAME, token: wrongSignature }, {
      currentDate: new Date(1_001_000), issuer: ISSUER, publicKey: keys.publicKey, queryOne
    })).rejects.toMatchObject({ code: 'PREVIEW_TOKEN_INVALID', statusCode: 401 })

    const noPreview = await signPageStudioSessionToken(claims({
      capabilities: ['workspace:create']
    }), keys.privateKey, ISSUER)
    await expect(authorizePageStudioPreview({ hostname: HOSTNAME, token: noPreview }, {
      currentDate: new Date(1_001_000), issuer: ISSUER, publicKey: keys.publicKey, queryOne
    })).rejects.toMatchObject({ code: 'PREVIEW_FORBIDDEN', statusCode: 403 })
    expect(queryOne).not.toHaveBeenCalled()
  })

  it('returns no release when the nonce is revoked, expired, out of scope, or has no active preview pointer', async () => {
    const keys = signingKeys()
    const token = await signPageStudioSessionToken(claims(), keys.privateKey, ISSUER)
    const queryOne = vi.fn(async () => null) as PageStudioDeliveryQueryOne

    await expect(authorizePageStudioPreview({ hostname: HOSTNAME, token }, {
      currentDate: new Date(1_001_000), issuer: ISSUER, publicKey: keys.publicKey, queryOne
    })).resolves.toBeNull()
  })
})
