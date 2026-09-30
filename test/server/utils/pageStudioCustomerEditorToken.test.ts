import { beforeAll, describe, expect, it } from 'vitest'
import { exportPKCS8, exportSPKI, generateKeyPair, SignJWT } from 'jose'
import { signCustomerEditorToken, verifyCustomerEditorToken, CustomerEditorClaimsSchema, CUSTOMER_EDITOR_TOKEN_TYPE, CUSTOMER_EDITOR_AUDIENCE } from '~~/server/utils/pageStudio/customerEditorToken'
import { verifyPageStudioSessionToken } from '~~/server/utils/pageStudio/sessions'

const issuer = 'https://dashboard.example.test'
const now = Math.floor(Date.now() / 1000)
const claims = { role: 'customer' as const, environment: 'staging' as const, nonce: crypto.randomUUID(),
  userId: crypto.randomUUID(), workspaceId: crypto.randomUUID(), siteId: crypto.randomUUID(), clientId: crypto.randomUUID(),
  tenantId: 'studio-customer-test', issuedAt: now, expiresAt: now + 120, capabilities: ['workspace:checkpoint' as const],
  editorOrigin: 'https://studio.example.test', returnUrl: `${issuer}/studio/dashboard` }
let privatePem: string, publicPem: string
let keys: Awaited<ReturnType<typeof generateKeyPair>>
beforeAll(async () => {
  keys = await generateKeyPair('ES256', { extractable: true })
  privatePem = await exportPKCS8(keys.privateKey)
  publicPem = await exportSPKI(keys.publicKey)
})
describe('native customer editor JWT contract', () => {
  it('round trips distinct customer claims and is rejected by the legacy verifier', async () => {
    const token = await signCustomerEditorToken(claims, privatePem, issuer)
    expect(await verifyCustomerEditorToken(token, publicPem, issuer)).toEqual(claims)
    await expect(verifyPageStudioSessionToken(token, publicPem, issuer)).rejects.toMatchObject({ statusCode: 401 })
  })
  it.each(['source:edit', 'model:invoke', 'publish', 'workspace:unknown'])('rejects forbidden capability %s', (capability) => {
    expect(CustomerEditorClaimsSchema.safeParse({ ...claims, capabilities: [capability] }).success).toBe(false)
  })
  it.each([{ role: 'agency' }, { environment: 'production' }, { returnUrl: 'https://foreign.example.test/anything' },
    { editorOrigin: 'https://studio.example.test/path' }, { capabilities: ['workspace:checkpoint', 'workspace:checkpoint'] },
    { expiresAt: now + 14401 }, { expiresAt: now }, { userId: 'staff-id' }, { unknown: 'field' }])('rejects invalid claims %j', (change) => {
    expect(CustomerEditorClaimsSchema.safeParse({ ...claims, ...change }).success).toBe(false)
  })
  it.each(['audience', 'issuer', 'type', 'subject', 'nonce', 'expires', 'issued'])('rejects signed %s mismatch', async (field) => {
    const token = await new SignJWT(claims)
      .setProtectedHeader({ alg: 'ES256', typ: field === 'type' ? 'XEROFLOW-PAGE-STUDIO-SESSION' : CUSTOMER_EDITOR_TOKEN_TYPE })
      .setIssuer(field === 'issuer' ? 'https://foreign.example.test' : issuer)
      .setAudience(field === 'audience' ? 'xeroflow-page-studio' : CUSTOMER_EDITOR_AUDIENCE)
      .setSubject(field === 'subject' ? crypto.randomUUID() : claims.userId)
      .setJti(field === 'nonce' ? crypto.randomUUID() : claims.nonce)
      .setIssuedAt(field === 'issued' ? now - 1 : now)
      .setExpirationTime(field === 'expires' ? now + 121 : now + 120)
      .sign(keys.privateKey)
    await expect(verifyCustomerEditorToken(token, publicPem, issuer)).rejects.toMatchObject({ statusCode: 401 })
  })
  it('rejects expiration, future issue dates, malformed tokens and changed signature', async () => {
    const token = await signCustomerEditorToken(claims, privatePem, issuer)
    await expect(verifyCustomerEditorToken(token, publicPem, issuer, new Date((now + 121) * 1000))).rejects.toMatchObject({ statusCode: 401 })
    const future = await signCustomerEditorToken({ ...claims, issuedAt: now + 100, expiresAt: now + 200 }, privatePem, issuer)
    await expect(verifyCustomerEditorToken(future, publicPem, issuer)).rejects.toMatchObject({ statusCode: 401 })
    await expect(verifyCustomerEditorToken('opaque-handoff', publicPem, issuer)).rejects.toMatchObject({ statusCode: 401 })
    const parts = token.split('.')
    parts[2] = `${parts[2]![0] === 'A' ? 'B' : 'A'}${parts[2]!.slice(1)}`
    await expect(verifyCustomerEditorToken(parts.join('.'), publicPem, issuer)).rejects.toMatchObject({ statusCode: 401 })
  })
})
