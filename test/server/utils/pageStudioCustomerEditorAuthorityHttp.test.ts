import { beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { createApp, eventHandler, toWebHandler } from 'h3'
import { exportPKCS8, exportSPKI, generateKeyPair } from 'jose'
import { customerEditorSessionHandler } from '../../../server/utils/pageStudio/customerEditorSessionHttp'
import { CUSTOMER_EDITOR_CAPABILITIES, signCustomerEditorToken, type CustomerEditorClaims } from '../../../server/utils/pageStudio/customerEditorToken'
import { collectionDigest } from '../../../shared/pageStudio/collectionApi'
import { destinationActivation } from '../../helpers/pageStudioDestinationActivation'

const mocks = vi.hoisted(() => ({ transaction: vi.fn(), authority: vi.fn() }))
vi.mock('~~/server/utils/db', () => ({ transaction: mocks.transaction }))
vi.mock('../../../server/utils/pageStudio/customerEditorSessionAuthority', async original => ({ ...await original(), assertCustomerEditorSessionAuthority: mocks.authority }))
const id = '10000000-0000-4000-8000-000000000001'
let privateKey: string, publicKey: string
const claims = (environment: 'staging' | 'production' = 'staging'): CustomerEditorClaims => ({ role: 'customer', environment, nonce: id, userId: id, workspaceId: id, clientId: id, siteId: id, tenantId: 'native', capabilities: [...CUSTOMER_EDITOR_CAPABILITIES], issuedAt: Math.floor(Date.now() / 1000) - 1, expiresAt: Math.floor(Date.now() / 1000) + 900, editorOrigin: environment === 'production' ? 'https://studio.example.test' : 'https://studio-customer-preview.xeroflow.io', returnUrl: 'https://app.xeroflow.io/studio/dashboard' })
const fetchPrivate = vi.fn(async (request: Request) => {
  const input = await request.json() as { claims: CustomerEditorClaims, capability: string }
  return Response.json({ authorized: true, sessionId: input.claims.nonce, capability: input.capability }, { headers: { 'x-request-digest': await collectionDigest(input) } })
})
const env = () => ({ ...destinationActivation(id), PAGE_STUDIO_RELEASE_ENVIRONMENT: 'production', PAGE_STUDIO_CONTENT_ENVIRONMENT: 'production', PAGE_STUDIO_PROVISIONING_ENVIRONMENT: 'production', PAGE_STUDIO_CUSTOMER_ORIGIN: 'https://app.xeroflow.io', PAGE_STUDIO_CONTROL_SECRET: 'x'.repeat(32), PAGE_STUDIO_SESSION_ISSUER: 'https://app.xeroflow.io', PAGE_STUDIO_SESSION_PRIVATE_KEY: privateKey, PAGE_STUDIO_SESSION_PUBLIC_KEY: publicKey, PAGE_STUDIO_CUSTOMER_PREVIEW_RUNTIME_ENABLED: 'true', PAGE_STUDIO_CUSTOMER_PREVIEW_EDITOR_ORIGIN: 'https://studio-customer-preview.xeroflow.io', PAGE_STUDIO_CUSTOMER_PREVIEW_PROVISIONER: { createProvisioning() {}, readProvisioning() {} }, PAGE_STUDIO_CUSTOMER_PREVIEW_CONTENT_ROUTER: { readManagedCmsTarget() {} }, PAGE_STUDIO_CUSTOMER_PREVIEW_CHECKPOINTS: { get() {} }, PAGE_STUDIO_MANAGEMENT: { fetch: fetchPrivate } })
function http(configuration: Record<string, unknown>) {
  const app = createApp()
  app.use(eventHandler((event) => {
    event.context.cloudflare = { env: configuration }
    return customerEditorSessionHandler(event, 'authorize')
  }))
  return toWebHandler(app)
}
async function request(value = claims(), body: unknown = { capability: 'workspace:reconnect' }, headers = {}) {
  return new Request('https://app.xeroflow.io/internal/page-studio/customer-sessions/authorize', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json', 'authorization': 'Bearer ' + 'x'.repeat(32), 'x-page-studio-customer-session': await signCustomerEditorToken(value, privateKey, 'https://app.xeroflow.io'), ...headers } })
}
beforeAll(async () => {
  const keys = await generateKeyPair('ES256', { extractable: true })
  privateKey = await exportPKCS8(keys.privateKey)
  publicKey = await exportSPKI(keys.publicKey)
})
beforeEach(() => {
  vi.clearAllMocks()
  mocks.transaction.mockRejectedValue(new Error('Distant local SQL must not run'))
})
it.each(['staging', 'production'] as const)('production release places each fresh %s authorization after genuine JWT admission', async (environment) => {
  const handle = http(env()), value = claims(environment)
  for (const capability of ['workspace:reconnect', 'workspace:preview']) {
    const response = await handle(await request(value, { capability }))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ authorized: true, sessionId: id, capability })
  }
  expect(fetchPrivate).toHaveBeenCalledTimes(2)
  expect(mocks.transaction).not.toHaveBeenCalled()
  expect(mocks.authority).not.toHaveBeenCalled()
})
it.each([undefined, 'preview', 'invalid'])('missing or unknown release selector %s never chooses local or private authority', async (release) => {
  const response = await http({ ...env(), PAGE_STUDIO_RELEASE_ENVIRONMENT: release })(await request())
  expect(response.status).toBe(503)
  expect(fetchPrivate).not.toHaveBeenCalled()
  expect(mocks.transaction).not.toHaveBeenCalled()
})
it('explicit shared staging retains its fresh local transaction', async () => {
  const configuration: Record<string, unknown> = { ...env(), PAGE_STUDIO_RELEASE_ENVIRONMENT: 'staging' }
  mocks.transaction.mockImplementation(async work => work({ query: vi.fn() }))
  for (let i = 0; i < 2; i++) expect((await http(configuration)(await request())).status).toBe(200)
  expect(mocks.transaction).toHaveBeenCalledTimes(2)
  expect(mocks.authority).toHaveBeenCalledTimes(2)
  expect(fetchPrivate).not.toHaveBeenCalled()
})
it.each([undefined, {}, { fetch: null }])('production missing private binding does not call distant SQL', async (binding) => {
  expect((await http({ ...env(), PAGE_STUDIO_MANAGEMENT: binding })(await request())).status).toBe(503)
  expect(mocks.transaction).not.toHaveBeenCalled()
})
it.each(['machine', 'signature', 'expired', 'origin', 'workspace', 'body'])('rejects signed public request %s before private dispatch', async (failure) => {
  const value = claims(failure === 'workspace' ? 'production' : 'staging')
  if (failure === 'expired') {
    value.issuedAt -= 1000
    value.expiresAt = Math.floor(Date.now() / 1000) - 1
  }
  if (failure === 'origin') value.editorOrigin = 'https://foreign.invalid'
  if (failure === 'workspace') value.workspaceId = '20000000-0000-4000-8000-000000000001'
  const headers = failure === 'machine' ? { authorization: 'Bearer wrong' } : failure === 'signature' ? { 'x-page-studio-customer-session': 'not-a-valid-jwt' } : {}
  expect((await http(env())(await request(value, failure === 'body' ? { capability: 'workspace:preview', extra: true } : undefined, headers))).status).toBeGreaterThanOrEqual(400)
  expect(fetchPrivate).not.toHaveBeenCalled()
  expect(mocks.transaction).not.toHaveBeenCalled()
})
it('rechecks production activation immediately after private response', async () => {
  const configuration = env(), original = fetchPrivate.getMockImplementation()!
  fetchPrivate.mockImplementationOnce(async (request) => {
    const response = await original(request)
    Object.assign(configuration, destinationActivation(id, '2020-01-01T00:00:00Z'))
    return response
  })
  expect((await http(configuration)(await request(claims('production')))).status).toBe(403)
  expect(fetchPrivate).toHaveBeenCalledOnce()
})
