import { createServer, type Server } from 'node:http'
import { createApp, createRouter, defineEventHandler, toNodeListener } from 'h3'
import { exportPKCS8, exportSPKI, generateKeyPair } from 'jose'
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { signCustomerEditorToken } from '~~/server/utils/pageStudio/customerEditorToken'
import { signPageStudioSessionToken } from '~~/server/utils/pageStudio/sessions'

const mocks = vi.hoisted(() => ({ exchange: vi.fn(), authorize: vi.fn(), commit: vi.fn(), read: vi.fn(), adopt: vi.fn(), upgrade: vi.fn() }))
vi.mock('~~/server/utils/pageStudio/customerEditorSessions', () => ({ exchangeCustomerEditorSession: mocks.exchange,
  assertCustomerEditorSessionAuthority: mocks.authorize, commitCustomerEditorCheckpoint: mocks.commit, readCustomerEditorCheckpoint: mocks.read }))
vi.mock('~~/server/utils/pageStudio/customerSchemaUpgrade', () => ({ coordinateCustomerSchemaUpgrade: mocks.upgrade }))
vi.mock('~~/server/utils/pageStudio/cmsAdoptionCoordinator', () => ({ coordinateCmsAdoption: mocks.adopt }))
vi.mock('~~/server/utils/db', () => ({ transaction: async (callback: (db: unknown) => unknown) => callback({}) }))
const issuer = 'https://customers.example.test', editorOrigin = 'https://studio.example.test'
const now = Math.floor(Date.now() / 1000)
const claims = { nonce: crypto.randomUUID(), userId: crypto.randomUUID(), workspaceId: crypto.randomUUID(), siteId: crypto.randomUUID(),
  clientId: crypto.randomUUID(), tenantId: 'studio-customer-test', role: 'customer' as const, environment: 'staging' as const,
  issuedAt: now, expiresAt: now + 600, capabilities: ['workspace:create' as const, 'workspace:checkpoint' as const, 'workspace:reconnect' as const],
  editorOrigin, returnUrl: `${issuer}/studio/dashboard` }
let server: Server, base: string, signed: string, legacy: string, config: Record<string, unknown>
let privatePem: string, publicPem: string
beforeAll(async () => {
  const keys = await generateKeyPair('ES256', { extractable: true })
  privatePem = await exportPKCS8(keys.privateKey)
  publicPem = await exportSPKI(keys.publicKey)
  signed = await signCustomerEditorToken(claims, privatePem, issuer)
  legacy = await signPageStudioSessionToken({ ...claims, role: 'client' }, privatePem, issuer)
  const { default: handler } = await import('~~/server/routes/internal/page-studio/customer-sessions/[operation].post')
  const app = createApp().use(defineEventHandler((event) => {
    event.context.cloudflare = { env: config }
  })).use(createRouter().post('/:operation', handler).handler)
  server = createServer(toNodeListener(app))
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`
})
afterAll(async () => {
  if (server) await new Promise<void>(resolve => server.close(() => resolve()))
})
beforeEach(() => {
  vi.resetAllMocks()
  config = { PAGE_STUDIO_CONTROL_SECRET: 'private-machine-secret', PAGE_STUDIO_CUSTOMER_EDITOR_ENABLED: 'true',
    PAGE_STUDIO_PROVISIONING_ENVIRONMENT: 'staging', PAGE_STUDIO_CUSTOMER_ORIGIN: issuer, PAGE_STUDIO_CUSTOMER_EDITOR_ORIGIN: editorOrigin,
    PAGE_STUDIO_SESSION_ISSUER: issuer, PAGE_STUDIO_SESSION_PRIVATE_KEY: privatePem, PAGE_STUDIO_SESSION_PUBLIC_KEY: publicPem }
  mocks.exchange.mockResolvedValue({ token: signed, sessionId: claims.nonce })
  mocks.authorize.mockResolvedValue({ claims })
  mocks.read.mockResolvedValue(null)
  mocks.commit.mockResolvedValue({ acknowledged: true })
})
const call = (path: string, body: unknown, headers: Record<string, string> = {}) => fetch(`${base}/${path}`, {
  method: 'POST', headers: { 'content-type': 'application/json', 'authorization': 'Bearer private-machine-secret',
    'x-page-studio-customer-session': signed, ...headers }, body: JSON.stringify(body)
})
describe('private native customer session endpoints', () => {
  it('requires machine identity in addition to the dedicated customer JWT', async () => {
    expect((await call('authorize', { capability: 'workspace:checkpoint' }, { authorization: '' })).status).toBe(401)
    expect((await call('authorize', { capability: 'workspace:checkpoint' }, { 'x-page-studio-customer-session': '' })).status).toBe(401)
    expect((await call('authorize', { capability: 'workspace:checkpoint' }, { 'x-page-studio-customer-session': legacy })).status).toBe(401)
    expect(mocks.authorize).not.toHaveBeenCalled()
  })
  it('returns exact current authority without caching', async () => {
    const response = await call('authorize', { capability: 'workspace:checkpoint' })
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(await response.json()).toEqual({ authorized: true, sessionId: claims.nonce, capability: 'workspace:checkpoint' })
    expect(mocks.authorize).toHaveBeenCalledWith(claims, 'workspace:checkpoint', {})
  })
  it('exchanges only an opaque ticket, never caller-selected identity or scope', async () => {
    expect((await call('exchange', { ticket: 'a'.repeat(64) })).status).toBe(200)
    expect((await call('exchange', { ticket: 'a'.repeat(64), siteId: claims.siteId })).status).toBe(400)
    expect(mocks.exchange).toHaveBeenCalledTimes(1)
  })
  it.each(['disabled', 'production', 'origin'])('fails closed for %s configuration', async (reason) => {
    if (reason === 'disabled') delete config.PAGE_STUDIO_CUSTOMER_EDITOR_ENABLED
    if (reason === 'production') config.PAGE_STUDIO_PROVISIONING_ENVIRONMENT = 'production'
    if (reason === 'origin') config.PAGE_STUDIO_CUSTOMER_EDITOR_ORIGIN = 'https://foreign.example.test'
    expect((await call('authorize', { capability: 'workspace:checkpoint' })).status).toBe(403)
    expect(mocks.authorize).not.toHaveBeenCalled()
  })
  it('reads only the signed scope and prevents forbidden capabilities', async () => {
    expect((await call('latest-checkpoint', {})).status).toBe(200)
    expect(mocks.read).toHaveBeenCalledWith(claims)
    expect((await call('latest-checkpoint', { siteId: 'foreign' })).status).toBe(400)
    expect((await call('authorize', { capability: 'source:edit' })).status).toBe(400)
  })
  it('rejects unknown dispatcher operations without invoking a service', async () => {
    expect((await call('publish', {})).status).toBe(404)
    for (const service of Object.values(mocks)) expect(service).not.toHaveBeenCalled()
  })
  it('dispatches checkpoint metadata and preserves write conflicts', async () => {
    const input = { checkpoint: { checkpointId: 'draft_example' }, expectedCheckpointId: null }
    expect((await call('checkpoint', input)).status).toBe(200)
    expect(mocks.commit).toHaveBeenCalledWith(input, claims, { env: { PAGE_STUDIO_CONTENT_ENVIRONMENT: undefined,
      PAGE_STUDIO_CHECKPOINTS: undefined, PAGE_STUDIO_CONTENT_ROUTER: undefined, PAGE_STUDIO_CMS_OBJECT_TRANSPORT: undefined } })
    mocks.commit.mockRejectedValueOnce({ statusCode: 409 })
    expect((await call('checkpoint', input)).status).toBe(409)
  })
  it('uses only server-owned CMS bindings, never bindings supplied in the body', async () => {
    config.PAGE_STUDIO_CONTENT_ENVIRONMENT = 'staging'
    config.PAGE_STUDIO_CHECKPOINTS = { get: vi.fn() }
    config.PAGE_STUDIO_CONTENT_ROUTER = { readManagedCmsTarget: vi.fn() }
    await call('checkpoint', { env: { PAGE_STUDIO_CONTENT_ENVIRONMENT: 'production' } })
    expect(mocks.commit.mock.calls[0]![2]).toEqual({ env: { PAGE_STUDIO_CONTENT_ENVIRONMENT: 'staging',
      PAGE_STUDIO_CHECKPOINTS: config.PAGE_STUDIO_CHECKPOINTS, PAGE_STUDIO_CONTENT_ROUTER: config.PAGE_STUDIO_CONTENT_ROUTER,
      PAGE_STUDIO_CMS_OBJECT_TRANSPORT: undefined } })
  })
  it('dispatches private customer setup using native creation authority and server bindings', async () => {
    config.PAGE_STUDIO_CONTENT_ENVIRONMENT = 'staging'
    mocks.adopt.mockResolvedValue({ phase: 'idle' })
    expect((await call('cms-adoption', { action: 'status' })).status).toBe(200)
    expect(mocks.adopt).toHaveBeenCalledWith({ action: 'status' }, {
      source: 'customer-session', claims, capability: 'workspace:create',
      env: { PAGE_STUDIO_CONTENT_ENVIRONMENT: 'staging', PAGE_STUDIO_CHECKPOINTS: undefined,
        PAGE_STUDIO_CONTENT_ROUTER: undefined, PAGE_STUDIO_CMS_OBJECT_TRANSPORT: undefined }
    })
    mocks.adopt.mockRejectedValueOnce({ statusCode: 403 })
    expect((await call('cms-adoption', { action: 'start' })).status).toBe(403)
  })
  it('preserves denial/conflict and hides unexpected provider or signing failures', async () => {
    mocks.authorize.mockRejectedValueOnce({ statusCode: 403, message: 'private native detail' })
    const denied = await call('authorize', { capability: 'workspace:checkpoint' })
    expect(denied.status).toBe(403)
    expect(await denied.text()).not.toContain('private native detail')
    mocks.exchange.mockRejectedValueOnce(new Error('private signing key'))
    const failed = await call('exchange', { ticket: 'a'.repeat(64) })
    expect(failed.status).toBe(503)
    expect(await failed.text()).not.toContain('private signing key')
  })
  it('dispatches private prerequisites with server-owned coordinator and dedicated claims', async () => {
    config.PAGE_STUDIO_PROVISIONER = { executeCollectionUpgrade: vi.fn() }
    mocks.upgrade.mockResolvedValue({ kind: 'collection', status: 'pending', recoveryId: null, canConfigure: true })
    const input = { action: 'status', kind: 'collection' }
    expect((await call('cms-prerequisites', input)).status).toBe(200)
    expect(mocks.upgrade).toHaveBeenCalledWith(input, claims, { env: { PAGE_STUDIO_PROVISIONING_ENVIRONMENT: 'staging', PAGE_STUDIO_PROVISIONER: config.PAGE_STUDIO_PROVISIONER } })
    expect((await call('cms-prerequisites', input, { 'x-page-studio-customer-session': legacy })).status).toBe(401)
    mocks.upgrade.mockRejectedValueOnce(new Error('private database and login details'))
    const response = await call('cms-prerequisites', input)
    expect(response.status).toBe(503)
    expect(await response.text()).not.toContain('private database')
  })
})
