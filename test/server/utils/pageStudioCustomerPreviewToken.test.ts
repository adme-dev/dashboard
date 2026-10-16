import { generateKeyPairSync, randomUUID } from 'node:crypto'
import { importPKCS8, SignJWT } from 'jose'
import { describe, expect, it } from 'vitest'
import { signCustomerPreviewToken, verifyCustomerPreviewToken, CUSTOMER_PREVIEW_TOKEN_TYPE, CUSTOMER_PREVIEW_AUDIENCE } from '~~/server/utils/pageStudio/customerPreviewToken'
import { verifyPageStudioSessionToken } from '~~/server/utils/pageStudio/sessions'
import { verifyCustomerEditorToken } from '~~/server/utils/pageStudio/customerEditorToken'

const keys = generateKeyPairSync('ec', { namedCurve: 'P-256' })
const privateKey = keys.privateKey.export({ format: 'pem', type: 'pkcs8' }).toString()
const publicKey = keys.publicKey.export({ format: 'pem', type: 'spki' }).toString()
const issuer = 'https://studio.example.test'
const now = Math.floor(Date.now() / 1000)
const claims = { role: 'customer' as const, environment: 'production' as const, purpose: 'release-preview' as const,
  nonce: randomUUID(), userId: randomUUID(), workspaceId: randomUUID(), clientId: randomUUID(), siteId: randomUUID(),
  tenantId: 'native-customer', hostname: 'build-one.preview.example.test', releaseId: randomUUID(),
  issuedAt: now, expiresAt: now + 300 }
const rawToken = async (change = {}, type = CUSTOMER_PREVIEW_TOKEN_TYPE, audience = CUSTOMER_PREVIEW_AUDIENCE) => {
  const value = { ...claims, ...change }
  return new SignJWT(value).setProtectedHeader({ alg: 'ES256', typ: type }).setIssuer(issuer).setAudience(audience)
    .setSubject(value.userId).setJti(value.nonce).setIssuedAt(value.issuedAt).setExpirationTime(value.expiresAt)
    .sign(await importPKCS8(privateKey, 'ES256'))
}
describe('Native release preview credentials', () => {
  it('round trips a dedicated five-minute, exact-release credential', async () => {
    const token = await signCustomerPreviewToken(claims, privateKey, issuer)
    expect(await verifyCustomerPreviewToken(token, publicKey, issuer)).toEqual(claims)
    await expect(verifyPageStudioSessionToken(token, publicKey, issuer)).rejects.toBeDefined()
    await expect(verifyCustomerEditorToken(token, publicKey, issuer)).rejects.toBeDefined()
  })
  it.each([{ expiresAt: now + 301 }, { issuedAt: now + 10, expiresAt: now + 300 }, { role: 'agency' },
    { environment: 'staging' }, { purpose: 'editor' }, { capabilities: ['workspace:create'] },
    { hostname: 'https://other.test' }, { releaseId: 'invalid' }, { tenantId: '../foreign' }])('rejects even correctly signed invalid claims %j', async (change) => {
    await expect(verifyCustomerPreviewToken(await rawToken(change), publicKey, issuer)).rejects.toMatchObject({ statusCode: 401 })
  })
  it('rejects expired tokens, wrong signer, audience, type and issuer', async () => {
    const token = await rawToken()
    await expect(verifyCustomerPreviewToken(token, publicKey, issuer, new Date((now + 301) * 1000))).rejects.toMatchObject({ statusCode: 401 })
    await expect(verifyCustomerPreviewToken(token, publicKey, 'https://foreign.test')).rejects.toMatchObject({ statusCode: 401 })
    await expect(verifyCustomerPreviewToken(await rawToken({}, 'XEROFLOW-PAGE-STUDIO-SESSION'), publicKey, issuer)).rejects.toMatchObject({ statusCode: 401 })
    await expect(verifyCustomerPreviewToken(await rawToken({}, undefined, 'xeroflow-page-studio'), publicKey, issuer)).rejects.toMatchObject({ statusCode: 401 })
    const other = generateKeyPairSync('ec', { namedCurve: 'P-256' }).publicKey.export({ format: 'pem', type: 'spki' }).toString()
    await expect(verifyCustomerPreviewToken(token, other, issuer)).rejects.toMatchObject({ statusCode: 401 })
  })
})
