import { createServer, type Server } from 'node:http'
import { createApp, defineEventHandler, toNodeListener } from 'h3'
import { exportPKCS8, exportSPKI, generateKeyPair } from 'jose'
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { signCustomerEditorToken } from '~~/server/utils/pageStudio/customerEditorToken'
import { signPageStudioSessionToken } from '~~/server/utils/pageStudio/sessions'

const mocks = vi.hoisted(() => ({ exchange: vi.fn(), authorize: vi.fn(), commit: vi.fn(), read: vi.fn() }))
vi.mock('~~/server/utils/pageStudio/customerEditorSessions', () => ({ exchangeCustomerEditorSession: mocks.exchange,
  assertCustomerEditorSessionAuthority: mocks.authorize, commitCustomerEditorCheckpoint: mocks.commit, readCustomerEditorCheckpoint: mocks.read }))
vi.mock('~~/server/utils/db', () => ({ transaction: async (callback: (db: unknown) => unknown) => callback({}) }))
const issuer = 'https://customers.example.test', editorOrigin = 'https://studio.example.test'
const now = Math.floor(Date.now() / 1000)
const claims = { nonce: crypto.randomUUID(), userId: crypto.randomUUID(), workspaceId: crypto.randomUUID(), siteId: crypto.randomUUID(),
  clientId: crypto.randomUUID(), tenantId: 'studio-customer-test', role: 'customer' as const, environment: 'staging' as const,
  issuedAt: now, expiresAt: now + 600, capabilities: ['workspace:checkpoint' as const, 'workspace:reconnect' as const],
  editorOrigin, returnUrl: `${issuer}/studio/dashboard` }
let server: Server, base: string, signed: string, legacy: string, config: Record<string, unknown>
let privatePem: string, publicPem: string
beforeAll(async () => {
  const keys = await generateKeyPair('ES256', { extractable: true })
  privatePem = await exportPKCS8(keys.privateKey)
  publicPem = await exportSPKI(keys.publicKey)
  signed = await signCustomerEditorToken(claims, privatePem, issuer)
  legacy = await signPageStudioSessionToken({ ...claims, role: 'client' }, privatePem, issuer)
  const { customerEditorSessionHandler } = await import('~~/server/utils/pageStudio/customerEditorSessionHttp')
  const app = createApp().use(defineEventHandler((event) => {
    event.context.cloudflare = { env: config }
    return customerEditorSessionHandler(event, event.path.slice(1) as 'exchange' | 'authorize' | 'checkpoint' | 'latest-checkpoint')
  }))
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
})
