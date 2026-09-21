import { createApp, createRouter, toWebHandler } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { handlePageStudioCollectionSetup } from '~~/server/utils/pageStudio/collectionSetupHttp'

const mocks = vi.hoisted(() => ({
  agency: vi.fn(),
  portal: vi.fn(),
  login: vi.fn(),
  admit: vi.fn(),
  prepare: vi.fn(),
  authorize: vi.fn(),
  query: vi.fn(),
  execute: vi.fn(),
  status: vi.fn()
}))
vi.mock('~~/server/utils/pageStudio/access', () => ({ requireAgencyPageStudioAccess: mocks.agency }))
vi.mock('~~/server/utils/clientAuth', () => ({ requireClientAuth: mocks.portal }))
vi.mock('~~/server/utils/pageStudio/contentNativeLogin', () => ({
  preparePageStudioContentLogin: mocks.login
}))
vi.mock('~~/server/utils/pageStudio/collections', () => ({ authorizePageStudioCollections: mocks.admit }))
vi.mock('~~/server/utils/pageStudio/collectionUpgradeIntent', () => ({
  preparePageStudioCollectionUpgrade: mocks.prepare
}))
vi.mock('~~/server/utils/pageStudio/collectionUpgradeAuthority', () => ({
  authorizePageStudioCollectionUpgrade: mocks.authorize
}))
vi.mock('~~/server/utils/db', () => ({ queryOneFresh: mocks.query }))
const scope = {
  tenantId: 'tenant',
  clientId: 'client',
  businessId: 'client',
  siteId: 'ad7a22f9-1c8a-44d7-92b2-d4202e4a2020',
  environment: 'staging'
}
const actor = {
  kind: 'client-user',
  userId: 'fed51648-dc08-41be-aa82-cdc5dde14aa6',
  loginSessionHash: 'a'.repeat(64)
}
const requestId = 'bcb294bf-8e35-40c9-bab2-033a8a7021a1'
const intent = {
  version: 1,
  policyVersion: 'collection-upgrade-v1',
  operationId: requestId,
  scope,
  actor,
  accountId: 'a'.repeat(32),
  databaseId: 'd87726cf-7b51-4392-8b11-97b880379c60',
  name: `ps-content-${'b'.repeat(32)}`,
  sourceDigest: '012054889e832d8753033811f9a6306d0b9f90a552c9f0a0af9ec5a6f62d435a',
  targetDigest: '0feb591f4c5fcb82c9b10204f7e387e83b4eb52eb634ce772f8cad8716ca0cee'
}
function request(method: 'GET' | 'POST', body?: unknown) {
  const router = createRouter()
  router.add(
    '/sites/:siteId/setup',
    (event) => {
      event.context.cloudflare = {
        env: {
          PAGE_STUDIO_PROVISIONING_ENVIRONMENT: 'staging',
          PAGE_STUDIO_PROVISIONER: {
            createProvisioning() {},
            readProvisioning() {},
            executeCollectionUpgrade: mocks.execute,
            readCollectionUpgradeOperation: mocks.status
          }
        }
      } as never
      return handlePageStudioCollectionSetup(event, 'portal', method)
    },
    [method.toLowerCase() as 'get' | 'post']
  )
  return toWebHandler(createApp().use(router))(
    new Request(`https://fixture.test/sites/${scope.siteId}/setup`, {
      method,
      body: body ? JSON.stringify(body) : undefined,
      headers: body ? { 'content-type': 'application/json' } : {}
    })
  )
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.portal.mockResolvedValue({ id: actor.userId, clientId: 'client', role: 'admin' })
  mocks.login.mockResolvedValue({ userId: actor.userId, tokenHash: actor.loginSessionHash })
  mocks.admit.mockResolvedValue({
    scope,
    collectionPolicy: { collection_capacity: true, plan_metadata: { builder: { collectionSchemas: true } } }
  })
  mocks.prepare.mockResolvedValue({ intent })
  mocks.authorize.mockResolvedValue(intent)
  mocks.query.mockResolvedValue(null)
  mocks.execute.mockResolvedValue({ status: 'running' })
})
describe('explicit collection setup', () => {
  it('GET status never prepares or executes an upgrade', async () => {
    expect((await request('GET')).status).toBe(200)
    expect(mocks.prepare).not.toHaveBeenCalled()
    expect(mocks.execute).not.toHaveBeenCalled()
  })
  it('POST uses prepared trusted intent and retains submitted requestId', async () => {
    const response = await request('POST', { requestId })
    expect(response.status).toBe(200)
    expect(mocks.prepare).toHaveBeenCalledWith(
      expect.objectContaining({ body: { requestId }, siteId: scope.siteId, environment: 'staging' })
    )
    expect(mocks.execute).toHaveBeenCalledWith(intent)
    expect(mocks.authorize).toHaveBeenCalledWith(intent, 'staging')
  })
  it('rejects forged intent properties and ordinary portal members before execution', async () => {
    expect((await request('POST', { requestId, scope })).status).toBe(400)
    mocks.portal.mockResolvedValue({ id: actor.userId, clientId: 'client', role: 'user' })
    expect((await request('POST', { requestId })).status).toBe(403)
    expect(mocks.execute).not.toHaveBeenCalled()
  })
  it('reports missing runtime policy as pending without replacing retained intent', async () => {
    mocks.execute.mockRejectedValueOnce(new Error('secret runtime configuration'))
    const response = await request('POST', { requestId })
    expect(response.status).toBe(503)
    expect(JSON.stringify(await response.json())).not.toContain('secret runtime')
  })
  it('withholds status retained by another native login', async () => {
    mocks.query.mockResolvedValue({
      metadata: {
        intent: { ...intent, actor: { ...actor, loginSessionHash: 'b'.repeat(64) } },
        body: { requestId }
      }
    })
    const response = await request('GET')
    expect(await response.json()).toEqual({ status: 'reconciliation', canConfigure: false })
    expect(mocks.status).not.toHaveBeenCalled()
  })
})

it.each(['GET', 'POST'] as const)('verifies the exact installed receipt on %s', async (method) => {
  const { actor: ignoredActor, version: ignoredVersion, policyVersion: ignoredPolicy, ...receipt } = intent
  mocks.query.mockResolvedValue({ metadata: { intent, body: { requestId } } })
  mocks.execute.mockResolvedValue({ status: 'installed', receipt })
  mocks.status.mockResolvedValue({ state: 'installed', leaseUntil: null, receipt })
  const response = await request(method, method === 'POST' ? { requestId } : undefined)
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({ status: 'installed', requestId })
})
it.each(['GET', 'POST'] as const)('rejects a substituted installed receipt on %s', async (method) => {
  const { actor: ignoredActor, version: ignoredVersion, policyVersion: ignoredPolicy, ...receipt } = intent
  const wrong = { ...receipt, operationId: 'foreign' }
  mocks.query.mockResolvedValue({ metadata: { intent, body: { requestId } } })
  mocks.execute.mockResolvedValue({ status: 'installed', receipt: wrong })
  mocks.status.mockResolvedValue({ state: 'installed', leaseUntil: null, receipt: wrong })
  expect((await request(method, method === 'POST' ? { requestId } : undefined)).status).toBe(502)
})
