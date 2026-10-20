import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import worker from '../../workers/page-studio-control/src/index'
import { NativeSchemaContracts } from '../../shared/pageStudio/nativeSchemaAuthority'

const authorizeSchemaUpgrade = vi.fn()
const upstream = vi.fn()
const kinds = Object.keys(NativeSchemaContracts) as (keyof typeof NativeSchemaContracts)[]
const actor = { kind: 'customer-user', userId: '10000000-0000-4000-8000-000000000001', loginSessionHash: 'a'.repeat(64) }
const scope = { tenantId: 'tenant', clientId: 'client', businessId: 'client', siteId: 'site', environment: 'staging' }
function intent(kind: keyof typeof NativeSchemaContracts) {
  const schema = NativeSchemaContracts[kind].schema
  return schema.parse({ version: 1, policyVersion: schema.shape.policyVersion.value,
    accountId: 'a'.repeat(32), databaseId: '10000000-0000-4000-8000-000000000002', name: 'ps-content-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    operationId: 'operation', actor, scope, sourceDigest: schema.shape.sourceDigest.value, targetDigest: schema.shape.targetDigest.value,
    ...(kind !== 'collection' ? { collectionOperationId: 'collection' } : {}),
    ...(['collection-staging', 'form-runtime', 'form-drafts'].includes(kind) ? { workflowOperationId: 'workflow' } : {}),
    ...(['form-runtime', 'form-drafts'].includes(kind) ? { stagingOperationId: 'staging' } : {}),
    ...(kind === 'form-drafts' ? { runtime: { digest: 'b'.repeat(64), etag: 'etag', successorIdentity: 'c'.repeat(64) } } : {}) })
}
function env(extra: Record<string, unknown> = {}) {
  return { DASHBOARD_ORIGIN: 'https://app.xeroflow.io', PAGE_STUDIO_CONTROL_SECRET: 's'.repeat(48), NATIVE_SCHEMA_TRANSPORT: 'placed-fetch',
    PAGE_STUDIO_NATIVE_SCHEMA_AUTHORITY: { fetch: async (request: Request) => Response.json(await authorizeSchemaUpgrade(await request.json())) }, ...extra } as Parameters<typeof worker.fetch>[1]
}
function request(kind: keyof typeof NativeSchemaContracts, body: unknown = intent(kind)) {
  return new Request(`https://control.internal${NativeSchemaContracts[kind].path}`, { method: 'POST', body: JSON.stringify(body) })
}
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('fetch', upstream)
  upstream.mockResolvedValue(Response.json({ legacy: true }))
  authorizeSchemaUpgrade.mockImplementation(async value => ({ ok: true, value: value.intent }))
})
afterEach(() => vi.unstubAllGlobals())
it.each(kinds)('uses private fresh exact authority for %s on every invocation', async (kind) => {
  const body = intent(kind)
  for (let i = 0; i < 2; i++) {
    const response = await worker.fetch(request(kind, body), env())
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(body)
  }
  expect(authorizeSchemaUpgrade).toHaveBeenCalledTimes(2)
  expect(authorizeSchemaUpgrade).toHaveBeenCalledWith({ kind, expectedControlPlaneEnvironment: 'production', intent: body })
  expect(upstream).not.toHaveBeenCalled()
})
it.each(kinds)('denies foreign logical scope and unknown input for %s', async (kind) => {
  for (const body of [{ ...intent(kind), scope: { ...scope, environment: 'production' } }, { ...intent(kind), extra: true }]) {
    const response = await worker.fetch(request(kind, body), env())
    expect(response.status).toBe(400)
  }
  expect(authorizeSchemaUpgrade).not.toHaveBeenCalled()
  expect(upstream).not.toHaveBeenCalled()
})
it('fails closed on missing private binding or wrong control-plane target', async () => {
  for (const extra of [{ NATIVE_SCHEMA_TRANSPORT: undefined }, { NATIVE_SCHEMA_TRANSPORT: 'wrong' }, { PAGE_STUDIO_NATIVE_SCHEMA_AUTHORITY: undefined }]) {
    expect((await worker.fetch(request('collection'), env(extra))).status).toBe(503)
  }
  expect(upstream).not.toHaveBeenCalled()
})
it('rejects altered and malformed authority replies and sanitizes failures', async () => {
  for (const result of [{ ok: true, value: { ...intent('collection'), operationId: 'different' } }, { ok: false, error: { code: 'PRIVATE', statusCode: 403, message: 'secret' } }, { ok: true }]) {
    authorizeSchemaUpgrade.mockResolvedValueOnce(result)
    const response = await worker.fetch(request('collection'), env())
    expect(response.status).toBe(503)
    expect(await response.text()).not.toContain('secret')
  }
})
it('retains nonnative forwarding and rejects malformed oversized bodies without RPC', async () => {
  const legacy = { ...intent('collection'), actor: { ...actor, kind: 'agency-user' } }
  expect((await worker.fetch(request('collection', legacy), env())).status).toBe(200)
  expect(upstream).toHaveBeenCalledOnce()
  upstream.mockClear()
  const oversized = new Request(`https://control.internal${NativeSchemaContracts.collection.path}`, { method: 'POST', body: ' '.repeat(16385) })
  expect((await worker.fetch(oversized, env())).status).toBe(413)
  expect(upstream).not.toHaveBeenCalled()
  expect(authorizeSchemaUpgrade).not.toHaveBeenCalled()
})

it('preserves the existing shared staging native callback transport', async () => {
  const response = await worker.fetch(request('collection'), env({ DASHBOARD_ORIGIN: 'https://preview.agency-dashboard-6cm.pages.dev', NATIVE_SCHEMA_TRANSPORT: undefined, PAGE_STUDIO_NATIVE_SCHEMA_AUTHORITY: undefined }))
  expect(response.status).toBe(200)
  expect(upstream).toHaveBeenCalledOnce()
  expect(upstream.mock.calls[0]?.[0].url).toBe('https://preview.agency-dashboard-6cm.pages.dev/internal/page-studio/collection-upgrades/authorize')
  expect(authorizeSchemaUpgrade).not.toHaveBeenCalled()
})

it('bounds the private response and never falls back after an oversized reply', async () => {
  const response = await worker.fetch(request('collection'), env({ PAGE_STUDIO_NATIVE_SCHEMA_AUTHORITY: { fetch: async () => new Response(' '.repeat(16385)) } }))
  expect(response.status).toBe(503)
  expect(upstream).not.toHaveBeenCalled()
})
