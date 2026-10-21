import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import control from '../../workers/page-studio-control/src/index'
import { collectionDigest } from '../../shared/pageStudio/collectionApi'
import { handleManagedTransferResourceAuthorityFetch } from '../../workers/page-studio-management/src/managedTransferResourceAuthority'

const mocks = vi.hoisted(() => ({ authorize: vi.fn() }))
vi.mock('~~/server/utils/pageStudio/managedTransferResources', () => ({ authorizeManagedTransferResources: mocks.authorize }))
const path = '/internal/page-studio/managed-transfers/resources/authorize'
const url = 'https://page-studio-management.internal/managed-transfer-resource-authority'
const resourceRequest = { version: 1, mode: 'attach-existing-content', operationId: 'original', policyVersion: 'content-attachment-v1', runtimeDigest: 'a'.repeat(64), schemaDigest: 'b'.repeat(64), actor: { kind: 'agency-user', userId: '10000000-0000-4000-8000-000000000001', loginSessionHash: 'c'.repeat(64) }, scope: { tenantId: 'tenant', clientId: 'client', businessId: 'client', siteId: 'site', environment: 'production' }, anchor: { checkpointId: 'original', digest: 'd'.repeat(64) } }
const input = { operationId: '10000000-0000-4000-8000-000000000002', intentDigest: 'e'.repeat(64), resourceRequest }
const receiverEnv = { PAGE_STUDIO_RELEASE_ENVIRONMENT: 'production', PAGE_STUDIO_CUSTOMER_PREVIEW_RUNTIME_ENABLED: 'true' }
const run = vi.fn()
const upstream = vi.fn()
const receiver = vi.fn((request: Request) => handleManagedTransferResourceAuthorityFetch(request, receiverEnv, run))
const env = () => ({ DASHBOARD_ORIGIN: 'https://app.xeroflow.io', PAGE_STUDIO_CONTROL_SECRET: 's'.repeat(48), NATIVE_SCHEMA_TRANSPORT: 'placed-fetch', PAGE_STUDIO_NATIVE_SCHEMA_AUTHORITY: { fetch: receiver } })
const request = (body: unknown = input) => new Request(`https://control.internal${path}`, { method: 'POST', body: JSON.stringify(body) })
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('fetch', upstream)
  mocks.authorize.mockImplementation(async value => value.resourceRequest)
  upstream.mockResolvedValue(Response.json({ legacy: true }))
})
afterEach(() => vi.unstubAllGlobals())
it('places every complete fresh authority call and preserves later denial', async () => {
  expect(await (await control.fetch(request(), env() as never)).json()).toEqual(resourceRequest)
  mocks.authorize.mockRejectedValueOnce({ statusCode: 403, message: 'private-secret' })
  const denied = await control.fetch(request(), env() as never)
  expect(denied.status).toBe(403)
  expect(await denied.text()).not.toContain('private-secret')
  expect(mocks.authorize).toHaveBeenCalledTimes(2)
  expect(mocks.authorize).toHaveBeenCalledWith(input, { runTransaction: run })
  expect(upstream).not.toHaveBeenCalled()
})
it.each(['NATIVE_SCHEMA_TRANSPORT', 'PAGE_STUDIO_NATIVE_SCHEMA_AUTHORITY'])('denies missing %s without public fallback', async (key) => {
  expect((await control.fetch(request(), { ...env(), [key]: undefined } as never)).status).toBe(503)
  expect(upstream).not.toHaveBeenCalled()
})
it('preserves shared staging forwarding', async () => {
  expect((await control.fetch(request(), { ...env(), DASHBOARD_ORIGIN: 'https://preview.agency-dashboard-6cm.pages.dev' } as never)).status).toBe(200)
  expect(upstream).toHaveBeenCalledOnce()
  expect(receiver).not.toHaveBeenCalled()
})
it.each([{ ...input, extra: true }, { ...input, resourceRequest: { ...resourceRequest, scope: { ...resourceRequest.scope, environment: 'staging' } } }])('denies malformed or foreign-scope input', async (body) => {
  expect((await control.fetch(request(body), env() as never)).status).toBe(400)
  expect(mocks.authorize).not.toHaveBeenCalled()
  expect(upstream).not.toHaveBeenCalled()
})
it('binds reply to complete execution reference as well as resource identity', async () => {
  const wrong = { expectedControlPlaneEnvironment: 'production', execution: { ...input, intentDigest: 'f'.repeat(64) } }
  const response = await control.fetch(request(), { ...env(), PAGE_STUDIO_NATIVE_SCHEMA_AUTHORITY: { fetch: async () => Response.json(resourceRequest, { headers: { 'x-request-digest': await collectionDigest(wrong) } }) } } as never)
  expect(response.status).toBe(503)
})
it('receiver denies unrelated paths and missing native configuration', async () => {
  expect((await handleManagedTransferResourceAuthorityFetch(new Request('https://public.invalid/'), receiverEnv, run)).status).toBe(404)
  const response = await handleManagedTransferResourceAuthorityFetch(new Request(url, { method: 'POST', body: JSON.stringify({ expectedControlPlaneEnvironment: 'production', execution: input }) }), {}, run)
  expect(response.status).toBe(503)
  expect(mocks.authorize).not.toHaveBeenCalled()
})
it.each(['redirect', 'oversized', 'utf8', 'foreign', 'error', 'throw'])('fails closed for %s private replies', async (kind) => {
  const fetch = async (request: Request) => {
    const body = await request.json()
    const headers = { 'x-request-digest': await collectionDigest(body) }
    if (kind === 'throw') throw new Error('private-secret')
    if (kind === 'redirect') return new Response(null, { status: 302, headers })
    if (kind === 'oversized') return new Response(' '.repeat(16385), { headers })
    if (kind === 'utf8') return new Response(new Uint8Array([255]), { headers })
    if (kind === 'foreign') return Response.json({ ...resourceRequest, operationId: 'foreign' }, { headers })
    return Response.json('private-secret', { status: 403, headers })
  }
  const response = await control.fetch(request(), { ...env(), PAGE_STUDIO_NATIVE_SCHEMA_AUTHORITY: { fetch } } as never)
  expect(response.status).toBe(503)
  expect(await response.text()).not.toContain('private-secret')
  expect(upstream).not.toHaveBeenCalled()
})
it('captures bound private receiver before body awaits', async () => {
  const service = { fetch: vi.fn(async function (this: unknown, request: Request) {
    expect(this).toBe(service)
    return receiver(request)
  }) }
  const original = service.fetch
  const body = new ReadableStream({ start(controller) {
    controller.enqueue(new TextEncoder().encode(JSON.stringify(input)))
    controller.close()
  } })
  const pending = control.fetch(new Request(`https://control.internal${path}`, { method: 'POST', body, duplex: 'half' } as RequestInit), { ...env(), PAGE_STUDIO_NATIVE_SCHEMA_AUTHORITY: service } as never)
  service.fetch = vi.fn()
  expect((await pending).status).toBe(200)
  expect(original).toHaveBeenCalledOnce()
  expect(service.fetch).not.toHaveBeenCalled()
})
