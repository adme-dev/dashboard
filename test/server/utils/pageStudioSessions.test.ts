import { generateKeyPairSync } from 'node:crypto'
import { importPKCS8, importSPKI, jwtVerify, SignJWT } from 'jose'
import { describe, expect, it, vi } from 'vitest'

import {
  issuePageStudioSession,
  MAX_PAGE_STUDIO_SESSION_LIFETIME_SECONDS,
  PAGE_STUDIO_SESSION_AUDIENCE,
  PAGE_STUDIO_SESSION_TOKEN_TYPE,
  signPageStudioSessionToken,
  verifyPageStudioSessionToken,
  type PageStudioSessionError,
  type PageStudioSessionClaims,
  type PageStudioSessionQueryClient
} from '~~/server/utils/pageStudio/sessions'

const SITE_ID = '11111111-1111-4111-8111-111111111111'
const CLIENT_ID = '22222222-2222-4222-8222-222222222222'
const ACTOR_ID = '33333333-3333-4333-8333-333333333333'
const ISSUER = 'https://preview.agency-dashboard-6cm.pages.dev'

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
    clientId: CLIENT_ID,
    expiresAt: 1_800,
    issuedAt: 1_000,
    nonce: '44444444-4444-4444-8444-444444444444',
    role: 'agency',
    siteId: SITE_ID,
    tenantId: 'tenant-alpha',
    userId: ACTOR_ID,
    ...overrides
  }
}

function database(row: Record<string, unknown> | undefined) {
  const query = vi.fn(async (sql: string, _params: unknown[] = []) => {
    if (sql.includes('FROM page_studio_sites')) return { rows: row ? [row] : [] }
    return { rows: [] }
  })
  const client = { query } as PageStudioSessionQueryClient
  const runTransaction = vi.fn(async <T>(callback: (db: PageStudioSessionQueryClient) => Promise<T>) => callback(client))
  return { query, runTransaction }
}

describe('Page Studio editor sessions', () => {
  it('signs the exact Page Studio ES256 token contract', async () => {
    const keys = signingKeys()
    const token = await signPageStudioSessionToken(claims(), keys.privateKey, ISSUER)
    const verified = await jwtVerify(token, await importSPKI(keys.publicKey, 'ES256'), {
      algorithms: ['ES256'],
      audience: PAGE_STUDIO_SESSION_AUDIENCE,
      currentDate: new Date(1_001_000),
      issuer: ISSUER,
      typ: PAGE_STUDIO_SESSION_TOKEN_TYPE
    })

    expect(verified.protectedHeader).toEqual({ alg: 'ES256', typ: PAGE_STUDIO_SESSION_TOKEN_TYPE })
    expect(verified.payload).toMatchObject({
      ...claims(),
      aud: PAGE_STUDIO_SESSION_AUDIENCE,
      exp: 1_800,
      iat: 1_000,
      iss: ISSUER,
      jti: claims().nonce,
      sub: ACTOR_ID
    })
  })

  it('rejects lifetimes beyond fifteen minutes before signing', async () => {
    const keys = signingKeys()

    await expect(signPageStudioSessionToken(claims({
      expiresAt: 1_000 + MAX_PAGE_STUDIO_SESSION_LIFETIME_SECONDS + 1
    }), keys.privateKey, ISSUER)).rejects.toMatchObject<Partial<PageStudioSessionError>>({
      code: 'SESSION_CLAIMS_INVALID',
      statusCode: 500
    })
  })

  it('projects a correctly signed token with invalid scoped claims as a 401', async () => {
    const keys = signingKeys()
    const invalidClaims = claims({ expiresAt: 1_901 })
    const token = await new SignJWT(invalidClaims)
      .setProtectedHeader({ alg: 'ES256', typ: PAGE_STUDIO_SESSION_TOKEN_TYPE })
      .setIssuer(ISSUER)
      .setAudience(PAGE_STUDIO_SESSION_AUDIENCE)
      .setSubject(invalidClaims.userId)
      .setJti(invalidClaims.nonce)
      .setIssuedAt(invalidClaims.issuedAt)
      .setExpirationTime(invalidClaims.expiresAt)
      .sign(await importPKCS8(keys.privateKey, 'ES256'))

    await expect(verifyPageStudioSessionToken(
      token,
      keys.publicKey,
      ISSUER,
      new Date(1_001_000)
    )).rejects.toMatchObject({ code: 'SESSION_TOKEN_INVALID', statusCode: 401 })
  })

  it('issues an agency session with raw source editing and appends no token to the database', async () => {
    const db = database({
      client_id: CLIENT_ID,
      entitlement_effective: true,
      entitlement_status: 'active',
      monthly_ai_operation_limit: 100,
      site_status: 'draft',
      tenant_id: 'tenant-alpha'
    })
    const signToken = vi.fn(async () => 'signed-token')

    await expect(issuePageStudioSession({
      actorId: ACTOR_ID,
      actorRole: 'agency',
      siteId: SITE_ID,
      tenantId: 'tenant-alpha'
    }, {
      now: () => 1_000,
      nonce: () => '44444444-4444-4444-8444-444444444444',
      runTransaction: db.runTransaction,
      signToken
    })).resolves.toEqual({
      capabilities: [
        'workspace:create',
        'workspace:reconnect',
        'workspace:checkpoint',
        'workspace:preview',
        'workspace:terminate',
        'workspace:status',
        'source:edit',
        'model:invoke'
      ],
      expiresAt: 1_900,
      sessionId: '44444444-4444-4444-8444-444444444444',
      token: 'signed-token'
    })

    const insert = db.query.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO page_studio_sessions'))
    expect(insert?.[1]).not.toContain('signed-token')
    expect(db.query).toHaveBeenCalledWith(
      expect.stringMatching(/INSERT INTO page_studio_audit_events[\s\S]*'session\.issued'/),
      expect.arrayContaining(['44444444-4444-4444-8444-444444444444'])
    )
  })

  it('issues a client editor session without raw source-edit capability', async () => {
    const db = database({
      client_id: CLIENT_ID,
      entitlement_effective: true,
      entitlement_status: 'trial',
      membership_role: 'editor',
      monthly_ai_operation_limit: 0,
      site_status: 'draft',
      tenant_id: 'tenant-alpha'
    })

    const result = await issuePageStudioSession({
      actorId: ACTOR_ID,
      actorRole: 'client',
      clientId: CLIENT_ID,
      siteId: SITE_ID
    }, {
      now: () => 1_000,
      nonce: () => '55555555-5555-4555-8555-555555555555',
      runTransaction: db.runTransaction,
      signToken: async () => 'client-token'
    })

    expect(result.capabilities).not.toContain('source:edit')
    expect(result.capabilities).not.toContain('model:invoke')
    expect(db.query.mock.calls[0]?.[1]).toEqual([CLIENT_ID, SITE_ID, ACTOR_ID])
  })

  it('fails closed for a portal viewer, suspended site, or inactive entitlement before signing', async () => {
    const cases = [
      { entitlement_effective: true, entitlement_status: 'active', membership_role: 'viewer', site_status: 'draft', code: 'PORTAL_EDITOR_REQUIRED' },
      { entitlement_effective: true, entitlement_status: 'active', membership_role: 'editor', site_status: 'suspended', code: 'SITE_UNAVAILABLE' },
      { entitlement_effective: true, entitlement_status: 'past_due', membership_role: 'editor', site_status: 'draft', code: 'ENTITLEMENT_REQUIRED' },
      { entitlement_effective: false, entitlement_status: 'active', membership_role: 'editor', site_status: 'draft', code: 'ENTITLEMENT_REQUIRED' }
    ] as const

    for (const testCase of cases) {
      const db = database({
        client_id: CLIENT_ID,
        monthly_ai_operation_limit: 100,
        tenant_id: 'tenant-alpha',
        ...testCase
      })
      const signToken = vi.fn(async () => 'must-not-sign')

      await expect(issuePageStudioSession({
        actorId: ACTOR_ID,
        actorRole: 'client',
        clientId: CLIENT_ID,
        siteId: SITE_ID
      }, { runTransaction: db.runTransaction, signToken })).rejects.toMatchObject({ code: testCase.code })
      expect(signToken).not.toHaveBeenCalled()
    }
  })
})
