import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import control from '../../workers/page-studio-control/src/index'
import { handleTransferRecoverySourceEffectFetch } from '../../workers/page-studio-management/src/transferRecoverySourceEffectFetch'
import { collectionDigest } from '../../shared/pageStudio/collectionApi'
import { sourceEffectTransportFixture } from './pageStudioTransferRecoverySourceEffectSupport'
const mocks = vi.hoisted(() => ({ authorize: vi.fn() }))
vi.mock('~~/server/utils/pageStudio/customerTransferRecoverySourceEffectAuthority', () => ({ authorizeCustomerTransferRecoverySourceEffect: mocks.authorize }))
const path = '/internal/page-studio/managed-transfers/recovery/source-effect'
const run = vi.fn(), upstream = vi.fn()
const config = { PAGE_STUDIO_RELEASE_ENVIRONMENT: 'production', PAGE_STUDIO_CUSTOMER_PREVIEW_RUNTIME_ENABLED: 'true' }
const receiver = vi.fn((request: Request) => handleTransferRecoverySourceEffectFetch(request, config, run))
const env = () => ({ DASHBOARD_ORIGIN: 'https://app.xeroflow.io', PAGE_STUDIO_CONTROL_SECRET: 's'.repeat(48),
  NATIVE_SCHEMA_TRANSPORT: 'placed-fetch', PAGE_STUDIO_NATIVE_SCHEMA_AUTHORITY: { fetch: receiver } })
let input: Awaited<ReturnType<typeof sourceEffectTransportFixture>>
const request = (body: unknown = input, suffix = '', method = 'POST') => new Request(`https://xeroflow-control.internal${path}${suffix}`, {
  method, ...(method === 'POST' ? { body: JSON.stringify(body) } : {})
})
beforeEach(async () => {
  input = await sourceEffectTransportFixture(); vi.clearAllMocks(); vi.stubGlobal('fetch', upstream)
  mocks.authorize.mockImplementation(async value => ({ purpose: value.purpose, envelopeDigest: await collectionDigest(value) }))
})
afterEach(() => vi.unstubAllGlobals())
it.each(['claim', 'dispatch', 'settle'] as const)('places exact %s authority through private binding without invoking an effect', async verb => {
  input = await sourceEffectTransportFixture(verb)
  expect(Buffer.byteLength(JSON.stringify(input))).toBeLessThan(16384)
  const response = await control.fetch(request(), env() as never)
  const digest = await collectionDigest(input)
  expect(response.status).toBe(200); expect(response.headers.get('x-request-digest')).toBe(digest)
  expect(await response.json()).toEqual({ purpose: 'recovery-source-effect', envelopeDigest: digest })
  expect(mocks.authorize).toHaveBeenCalledExactlyOnceWith(input, { env: config, runTransaction: run })
  expect(upstream).not.toHaveBeenCalled()
})
it.each(['NATIVE_SCHEMA_TRANSPORT', 'PAGE_STUDIO_NATIVE_SCHEMA_AUTHORITY'])('denies missing %s without public fallback', async key => {
  expect((await control.fetch(request(), { ...env(), [key]: undefined } as never)).status).toBe(503)
  expect(upstream).not.toHaveBeenCalled()
})
it('rejects preview origins, query and alternate methods before forwarding', async () => {
  expect((await control.fetch(request(), { ...env(), DASHBOARD_ORIGIN: 'https://preview.agency-dashboard-6cm.pages.dev' } as never)).status).toBe(503)
  expect((await control.fetch(request(input, '?force=1'), env() as never)).status).toBe(400)
  expect((await control.fetch(request(input, '', 'GET'), env() as never)).status).toBe(400)
  expect(receiver).not.toHaveBeenCalled(); expect(upstream).not.toHaveBeenCalled()
})
it('redacts authority denial without retry or fallback', async () => {
  mocks.authorize.mockRejectedValueOnce({ statusCode: 403, message: 'secret sql' })
  const response = await control.fetch(request(), env() as never)
  expect(response.status).toBe(403); expect(await response.text()).not.toContain('secret sql')
  expect(receiver).toHaveBeenCalledOnce(); expect(upstream).not.toHaveBeenCalled()
})
it.each(['redirect', 'oversized', 'utf8', 'wrong-purpose', 'wrong-digest', 'extra', 'throw'])('rejects %s responses without retry', async kind => {
  const fetch = vi.fn(async () => {
    const digest = await collectionDigest(input), headers = { 'x-request-digest': digest }
    if (kind === 'throw') throw new Error('private')
    if (kind === 'redirect') return new Response(null, { status: 302, headers })
    if (kind === 'oversized') return new Response(' '.repeat(16385), { headers })
    if (kind === 'utf8') return new Response(new Uint8Array([255]), { headers })
    return Response.json({ purpose: kind === 'wrong-purpose' ? 'recovery-enabled' : 'recovery-source-effect',
      envelopeDigest: kind === 'wrong-digest' ? 'f'.repeat(64) : digest, ...(kind === 'extra' ? { acquired: true } : {}) }, { headers })
  })
  expect((await control.fetch(request(), { ...env(), PAGE_STUDIO_NATIVE_SCHEMA_AUTHORITY: { fetch } } as never)).status).toBe(503)
  expect(fetch).toHaveBeenCalledOnce(); expect(upstream).not.toHaveBeenCalled()
})
it('does not alias old read-only recovery authority', async () => {
  const { default: enabled } = await import('../fixtures/transfer-recovery-phase-enabled.json')
  expect((await control.fetch(request(enabled), env() as never)).status).toBe(400)
  const readonlyRequest = new Request('https://xeroflow-control.internal/internal/page-studio/managed-transfers/recovery/phase', { method: 'POST', body: JSON.stringify(input) })
  expect((await control.fetch(readonlyRequest, env() as never)).status).toBe(400)
  expect(mocks.authorize).not.toHaveBeenCalled(); expect(upstream).not.toHaveBeenCalled()
})
