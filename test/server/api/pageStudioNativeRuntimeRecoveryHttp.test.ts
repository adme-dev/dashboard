import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { createApp, createRouter, toWebHandler, eventHandler } from 'h3'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { collectionDigest } from '../../../shared/pageStudio/collectionApi'

const mocks = vi.hoisted(() => ({ auth: vi.fn(), operator: vi.fn(), login: vi.fn(), bind: vi.fn(), rpc: vi.fn(), limit: vi.fn() }))
vi.mock('~~/server/utils/auth', () => ({ requireAuth: mocks.auth }))
vi.mock('~~/server/utils/db', () => ({ transactionWithoutRetry: async work => work({}), transaction: async work => work({}) }))
vi.mock('~~/server/utils/pageStudio/customerPlanGrants', () => ({ requireCustomerPlanOperator: mocks.operator }))
vi.mock('~~/server/utils/pageStudio/loginSessions', () => ({ resolvePageStudioLoginSession: mocks.login, bindPageStudioLoginSession: mocks.bind }))
vi.mock('~~/server/utils/rateLimit', () => ({ checkAndConsume: mocks.limit }))
const siteId = randomUUID(), requestId = randomUUID(), actorId = randomUUID(), reviewId = randomUUID()
const value = { siteId, requestId, reviewId, operationId: 'original-cms', reviewDigest: 'd'.repeat(64), phase: 'prepared' }
async function request(body: unknown = { action: 'prepare' }, options: { cookie?: string, origin?: string, method?: string, query?: string, env?: Record<string, unknown> } = {}) {
  const loaded = await import('../../../server/api/agency/page-studio/sites/[siteId]/cms-runtime-recovery/[requestId].post')
  const env = { PAGE_STUDIO_RELEASE_ENVIRONMENT: 'production', PAGE_STUDIO_MANAGEMENT: { nativeRuntimeRecovery: mocks.rpc }, ...options.env }
  const app = createApp().use((event) => {
    event.context.cloudflare = { env }
  }).use(createRouter().use('/sites/:siteId/recovery/:requestId', loaded.default))
  return toWebHandler(app)(new Request(`https://app.xeroflow.io/sites/${siteId}/recovery/${requestId}${options.query ?? ''}`, {
    method: options.method ?? 'POST',
    headers: { 'host': 'app.xeroflow.io', 'x-forwarded-proto': 'https', 'origin': options.origin ?? 'https://app.xeroflow.io', 'cookie': options.cookie ?? 'auth_token=ordinary-login', 'content-type': 'application/json' },
    ...(options.method === 'GET' ? {} : { body: JSON.stringify(body) })
  }))
}
beforeEach(() => {
  vi.resetAllMocks()
  vi.stubGlobal('defineEventHandler', eventHandler)
  mocks.auth.mockResolvedValue({ id: actorId })
  mocks.login.mockResolvedValue({ userId: actorId, tokenHash: 'a'.repeat(64), role: 'agency' })
  mocks.limit.mockResolvedValue({ allowed: true })
  mocks.rpc.mockImplementation(async input => ({ ok: true, requestDigest: await collectionDigest(input), value }))
})
afterEach(() => vi.unstubAllGlobals())
it.each(['prepare', 'apply', 'status'])('derives %s from genuine operator cookie and rechecks after one fixed RPC', async (action) => {
  const response = await request({ action, ...(action === 'prepare' ? {} : { reviewId }) })
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual(value)
  expect(response.headers.get('cache-control')).toBe('private, no-store')
  expect(mocks.rpc).toHaveBeenCalledOnce()
  expect(mocks.rpc.mock.calls[0]![0]).toMatchObject({ siteId, requestId, action, expectedControlPlaneEnvironment: 'production', operator: { actorId, loginSessionHash: 'a'.repeat(64) } })
  expect(mocks.auth).toHaveBeenCalledTimes(2)
  expect(mocks.operator).toHaveBeenCalledTimes(2)
  expect(mocks.bind).toHaveBeenCalledTimes(2)
})
it.each([
  [{ cookie: '' }, 401], [{ origin: 'https://foreign.invalid' }, 403], [{ method: 'GET' }, 405],
  [{ query: '?operator=forged' }, 400]
] as const)('rejects invalid boundary before RPC', async (options, status) => {
  expect((await request(undefined, options)).status).toBe(status)
  expect(mocks.rpc).not.toHaveBeenCalled()
})
it.each([{ action: 'prepare', operator: { actorId } }, { action: 'upload' }, { action: 'apply', intent: {} }])('rejects caller-supplied authority and provider payloads', async (body) => {
  expect((await request(body)).status).toBe(400)
  expect(mocks.rpc).not.toHaveBeenCalled()
})
it('denies role loss and logout before and after the private call', async () => {
  mocks.operator.mockRejectedValueOnce({ statusCode: 403 })
  expect((await request()).status).toBe(403)
  expect(mocks.rpc).not.toHaveBeenCalled()
  mocks.operator.mockResolvedValueOnce(undefined).mockRejectedValueOnce({ statusCode: 403 })
  expect((await request()).status).toBe(403)
  expect(mocks.rpc).toHaveBeenCalledOnce()
})
it('does not retry a lost acknowledgement and rejects a foreign response', async () => {
  mocks.rpc.mockRejectedValueOnce(new Error('private credentials'))
  const failed = await request()
  expect(failed.status).toBe(503)
  expect(await failed.text()).not.toContain('credentials')
  expect(mocks.rpc).toHaveBeenCalledOnce()
  mocks.rpc.mockImplementationOnce(async input => ({ ok: true, requestDigest: await collectionDigest(input), value: { ...value, siteId: randomUUID() } }))
  expect((await request()).status).toBe(503)
})
it('fails closed on environment, missing binding, rate limit and oversized input', async () => {
  expect((await request(undefined, { env: { PAGE_STUDIO_RELEASE_ENVIRONMENT: 'staging' } })).status).toBe(503)
  expect((await request(undefined, { env: { PAGE_STUDIO_MANAGEMENT: undefined } })).status).toBe(503)
  expect((await request({ padding: 'x'.repeat(1025) })).status).toBe(413)
  mocks.limit.mockResolvedValueOnce({ allowed: false, resetAt: new Date(Date.now() + 1000) })
  expect((await request()).status).toBe(429)
  expect(mocks.rpc).not.toHaveBeenCalled()
})

it('keeps the public recovery route on the small operator contract', () => {
  const source = (path: string) => readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8')
  const route = source('server/api/agency/page-studio/sites/[siteId]/cms-runtime-recovery/[requestId].post.ts')
  expect(route).toContain('handleTransferOperatorHttp(event, \'POST\', \'runtime-recovery\')')
  for (const path of ['server/utils/pageStudio/transferControlsHttp.ts', 'server/utils/pageStudio/transferControls.ts']) {
    const text = source(path)
    expect(text).toContain('shared/pageStudio/nativeRuntimeRecoveryOperator')
    expect(text).not.toMatch(/nativeRuntimeRecoveryWire|nativeRuntimeRecoveryContract|workers\/|content-runtime-replacement/)
  }
  const contract = source('shared/pageStudio/nativeRuntimeRecoveryOperator.ts')
  expect(contract.match(/^import .+$/gm)).toEqual(['import { z } from \'zod\''])
  expect(contract).not.toMatch(/intent:|approval:|originalRow|loginSession/)
})
