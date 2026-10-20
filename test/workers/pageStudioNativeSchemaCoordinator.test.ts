import Management from '../../workers/page-studio-management/src/index'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { callNativeSchemaCoordinator } from '../../server/utils/pageStudio/nativeSchemaCoordinatorClient'
import { handleNativeSchemaCoordinatorFetch } from '../../workers/page-studio-management/src/nativeSchemaCoordinator'
import { NATIVE_SCHEMA_COORDINATOR_URL, NATIVE_SCHEMA_COORDINATOR_DIGEST_HEADER, NATIVE_SCHEMA_COORDINATOR_ERROR } from '../../shared/pageStudio/nativeSchemaCoordinator'

const coordinate = vi.hoisted(() => vi.fn())
vi.mock('cloudflare:workers', () => ({ WorkerEntrypoint: class {
  env: unknown
  constructor(_ctx: unknown, env: unknown) { this.env = env }
} }))
vi.mock('../../server/utils/pageStudio/customerSchemaUpgrade', () => ({ coordinateCustomerSchemaUpgrade: coordinate }))
const id = '10000000-0000-4000-8000-000000000001'
const claims: import('../../server/utils/pageStudio/customerEditorToken').CustomerEditorClaims = { role: 'customer', environment: 'staging', nonce: id, userId: id, workspaceId: id, clientId: id, siteId: id,
  tenantId: 'tenant', capabilities: ['cms:prepare', 'cms:adopt'], issuedAt: 1_700_000_000, expiresAt: 1_700_000_900,
  editorOrigin: 'https://studio-customer-preview.xeroflow.io', returnUrl: 'https://app.xeroflow.io/studio/dashboard' }
const input: import('../../shared/pageStudio/customerSchemaUpgrade').CustomerSchemaUpgradeRequest = { action: 'start', kind: 'collection', requestId: id }
const nativeBinding = { createProvisioning: vi.fn(), readProvisioning: vi.fn(), executeCollectionUpgrade: vi.fn() }
const env = { PAGE_STUDIO_RELEASE_ENVIRONMENT: 'production', PAGE_STUDIO_PROVISIONING_ENVIRONMENT: 'production', PAGE_STUDIO_CUSTOMER_PREVIEW_RUNTIME_ENABLED: 'true',
  PAGE_STUDIO_CUSTOMER_PREVIEW_PROVISIONER: nativeBinding, PAGE_STUDIO_CUSTOMER_PREVIEW_CONTENT_ROUTER: { readManagedCmsTarget: vi.fn() },
  PAGE_STUDIO_CUSTOMER_PREVIEW_CHECKPOINTS: { get: vi.fn() }, PAGE_STUDIO_CUSTOMER_PREVIEW_EDITOR_ORIGIN: claims.editorOrigin }
const run = vi.fn()
const request = (body: unknown = { expectedControlPlaneEnvironment: 'production', request: input, claims }, url = NATIVE_SCHEMA_COORDINATOR_URL) => new Request(url, { method: 'POST', body: JSON.stringify(body) })
const fetchPrivate = vi.fn((value: Request) => handleNativeSchemaCoordinatorFetch(value, env, run))
const clientEnv = () => ({ ...env, PAGE_STUDIO_MANAGEMENT: { fetch: fetchPrivate } })
beforeEach(() => {
  vi.clearAllMocks()
  coordinate.mockImplementation(async value => ({ kind: value.kind, status: 'running', requestId: value.requestId, recoveryId: null, canConfigure: true }))
  fetchPrivate.mockImplementation(value => handleNativeSchemaCoordinatorFetch(value, env, run))
  vi.stubGlobal('fetch', vi.fn(() => {
    throw new Error('external fetch forbidden')
  }))
})
afterEach(() => vi.unstubAllGlobals())
it.each(['collection', 'workflow', 'collection-staging', 'form-runtime', 'form-drafts'] as const)('places unchanged %s coordinator with only fixed native binding and original transaction runner', async (kind) => {
  expect(await callNativeSchemaCoordinator({ ...input, kind }, claims, clientEnv())).toMatchObject({ kind, status: 'running', requestId: id })
  expect(coordinate).toHaveBeenCalledWith({ ...input, kind }, claims, { binding: nativeBinding, runTransaction: run })
  expect(run).not.toHaveBeenCalled() // Receiver never wraps provider work in a transaction.
  expect(fetchPrivate.mock.calls[0]?.[0].url).toBe(NATIVE_SCHEMA_COORDINATOR_URL)
  expect(fetch).not.toHaveBeenCalled()
})
it.each([undefined, {}, { fetch: null }])('missing binding never falls back', async (binding) => {
  await expect(callNativeSchemaCoordinator(input, claims, { ...env, PAGE_STUDIO_MANAGEMENT: binding })).rejects.toMatchObject({ statusCode: 503 })
  expect(coordinate).not.toHaveBeenCalled()
  expect(fetch).not.toHaveBeenCalled()
})
it.each([400, 401, 403, 409, 500])('redacts coordinator failure %s and never retries', async (statusCode) => {
  coordinate.mockRejectedValue({ statusCode, message: 'synthetic-private-secret' })
  await expect(callNativeSchemaCoordinator(input, claims, clientEnv())).rejects.toMatchObject({ statusCode: statusCode === 500 ? 503 : statusCode })
  expect(coordinate).toHaveBeenCalledOnce()
  expect(fetchPrivate).toHaveBeenCalledOnce()
  expect(await (await handleNativeSchemaCoordinatorFetch(request(), env, run)).text()).not.toContain('synthetic-private-secret')
})
it.each([NATIVE_SCHEMA_COORDINATOR_URL + '?x=1', NATIVE_SCHEMA_COORDINATOR_URL + '/other', 'https://public.invalid/native-schema-coordinator'])('other private URL is404: %s', async (url) => {
  expect((await handleNativeSchemaCoordinatorFetch(request(undefined, url), env, run)).status).toBe(404)
  expect(coordinate).not.toHaveBeenCalled()
})
it('rejects GET, oversized and unknown fields without coordinator dispatch', async () => {
  expect((await handleNativeSchemaCoordinatorFetch(new Request(NATIVE_SCHEMA_COORDINATOR_URL), env, run)).status).toBe(404)
  for (const value of [new Request(NATIVE_SCHEMA_COORDINATOR_URL, { method: 'POST', body: ' '.repeat(16385) }), request({ expectedControlPlaneEnvironment: 'production', request: input, claims, method: 'arbitrary' }), request({ expectedControlPlaneEnvironment: 'production', request: input, claims: { ...claims, environment: 'production' } })]) {
    const response = await handleNativeSchemaCoordinatorFetch(value, env, run)
    expect(response.status).toBe(400)
    expect(await response.json()).toBe(NATIVE_SCHEMA_COORDINATOR_ERROR)
  }
  expect(coordinate).not.toHaveBeenCalled()
})
it.each([{ PAGE_STUDIO_RELEASE_ENVIRONMENT: 'staging' }, { PAGE_STUDIO_CUSTOMER_PREVIEW_RUNTIME_ENABLED: undefined }, { PAGE_STUDIO_CUSTOMER_PREVIEW_PROVISIONER: undefined }])('configuration fails closed without legacy staging fallback', async (change) => {
  const response = await handleNativeSchemaCoordinatorFetch(request(), { ...env, ...change }, run)
  expect(response.status).toBe(503)
  expect(await response.json()).toBe(NATIVE_SCHEMA_COORDINATOR_ERROR)
  expect(coordinate).not.toHaveBeenCalled()
})
it.each(['malformed', 'oversized', 'wrong-digest', 'wrong-kind', 'wrong-request', 'throw'])('client denies %s response without retry', async (failure) => {
  fetchPrivate.mockImplementationOnce(async (value) => {
    if (failure === 'throw') throw new Error('synthetic-secret')
    const response = await handleNativeSchemaCoordinatorFetch(value, env, run)
    const headers = new Headers(response.headers)
    if (failure === 'malformed') return new Response('synthetic-secret', { headers })
    if (failure === 'oversized') return new Response(' '.repeat(16385), { headers })
    const body = await response.json() as { kind: string, requestId: string }
    if (failure === 'wrong-digest') headers.set(NATIVE_SCHEMA_COORDINATOR_DIGEST_HEADER, '0'.repeat(64))
    if (failure === 'wrong-kind') body.kind = 'workflow'
    if (failure === 'wrong-request') body.requestId = '20000000-0000-4000-8000-000000000001'
    return Response.json(body, { headers })
  })
  await expect(callNativeSchemaCoordinator(input, claims, clientEnv())).rejects.toMatchObject({ statusCode: 503 })
  expect(fetchPrivate).toHaveBeenCalledOnce()
  expect(fetch).not.toHaveBeenCalled()
})

it('default fetch dispatches only the exact coordinator URL while unrelated fetch remains404', async () => {
  const worker = new Management({} as never, { ...env, HYPERDRIVE_FRESH: { connectionString: 'synthetic-not-used' } } as never)
  expect(await (await worker.fetch(request())).json()).toMatchObject({ kind: 'collection', requestId: id })
  expect(coordinate).toHaveBeenCalledOnce()
  for (const url of ['https://public.invalid/', NATIVE_SCHEMA_COORDINATOR_URL + '?extra=true']) expect((await worker.fetch(request(undefined, url))).status).toBe(404)
  expect(coordinate).toHaveBeenCalledOnce()
})

it('detaches original inputs before digest/transport awaits', async () => {
  const action = structuredClone(input), principal = structuredClone(claims)
  const result = callNativeSchemaCoordinator(action, principal, clientEnv())
  action.requestId = '20000000-0000-4000-8000-000000000001'
  principal.siteId = action.requestId
  expect(await result).toMatchObject({ requestId: id })
  expect(coordinate).toHaveBeenCalledWith(input, claims, expect.anything())
})
it.each(['missing-digest', 'wrong-digest', 'wrong-message', 'unknown-status', 'oversized', 'invalid-utf8'])('rejects unbound or malformed error: %s', async (failure) => {
  fetchPrivate.mockImplementationOnce(async (value) => {
    const response = await handleNativeSchemaCoordinatorFetch(value, env, run)
    const headers = new Headers(response.headers)
    if (failure === 'missing-digest') headers.delete(NATIVE_SCHEMA_COORDINATOR_DIGEST_HEADER)
    if (failure === 'wrong-digest') headers.set(NATIVE_SCHEMA_COORDINATOR_DIGEST_HEADER, '0'.repeat(64))
    const body = failure === 'oversized' ? ' '.repeat(16385) : failure === 'invalid-utf8' ? new Uint8Array([0xff]) : JSON.stringify(failure === 'wrong-message' ? 'synthetic-secret' : NATIVE_SCHEMA_COORDINATOR_ERROR)
    return new Response(body, { status: failure === 'unknown-status' ? 418 : 403, headers })
  })
  await expect(callNativeSchemaCoordinator(input, claims, clientEnv())).rejects.toMatchObject({ statusCode: 503, statusMessage: NATIVE_SCHEMA_COORDINATOR_ERROR })
  expect(fetchPrivate).toHaveBeenCalledOnce()
})
it('coordinator has no object-reader timeout signal', async () => {
  await callNativeSchemaCoordinator(input, claims, clientEnv())
  expect(fetchPrivate.mock.calls[0]?.[0].signal.aborted).toBe(false)
  const timeout = vi.spyOn(AbortSignal, 'timeout')
  await callNativeSchemaCoordinator(input, claims, clientEnv())
  expect(timeout).not.toHaveBeenCalled()
  timeout.mockRestore()
})

it('binds a strict receiver rejection before any coordinator dispatch', async () => {
  // Deliberate private typed-boundary bypass; the public caller already parses.
  const forged = { ...input, siteId: id }
  await expect(callNativeSchemaCoordinator(forged, claims, clientEnv())).rejects.toMatchObject({ statusCode: 400, statusMessage: NATIVE_SCHEMA_COORDINATOR_ERROR })
  expect(coordinate).not.toHaveBeenCalled()
  expect(fetchPrivate).toHaveBeenCalledOnce()
})
