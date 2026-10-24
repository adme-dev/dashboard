import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import Management from '../../workers/page-studio-management/src/index'
import control from '../../workers/page-studio-control/src/index'
import { handleTransferRecoverySourceReadyFetch } from '../../workers/page-studio-management/src/transferRecoverySourceReadyFetch'
import { collectionDigest } from '../../shared/pageStudio/collectionApi'
import { sourceEffectTransportFixture } from './pageStudioTransferRecoverySourceEffectSupport'

vi.mock('cloudflare:workers', () => ({ WorkerEntrypoint: class {
  env: unknown
  constructor(_ctx: unknown, env: unknown) { this.env = env }
} }))
const mocks = vi.hoisted(() => ({ authorize: vi.fn() }))
vi.mock('~~/server/utils/pageStudio/customerTransferRecoverySourceFreezeAuthority', () => ({ authorizeCustomerTransferRecoverySourceReady: mocks.authorize }))
const path = '/internal/page-studio/managed-transfers/recovery/source-ready'
const url = 'https://page-studio-management.internal/transfer-recovery-source-ready'
const descriptor = { formatVersion: 1, kind: 'managed-transfer-recovery-source-freeze-v1', layoutDigest: 'f'.repeat(64) }
const config = () => ({ PAGE_STUDIO_RELEASE_ENVIRONMENT: 'production', PAGE_STUDIO_CUSTOMER_PREVIEW_RUNTIME_ENABLED: 'true',
  MANAGED_TRANSFER_RECOVERY_SOURCE_FREEZE_POLICY: JSON.stringify(descriptor) })
const run = vi.fn(), upstream = vi.fn()
let input: Record<string, unknown>
let management: ReturnType<typeof config>
const receiver = vi.fn((request: Request) => handleTransferRecoverySourceReadyFetch(request, management, run))
const env = () => ({ DASHBOARD_ORIGIN: 'https://app.xeroflow.io', PAGE_STUDIO_CONTROL_SECRET: 's'.repeat(48),
  NATIVE_SCHEMA_TRANSPORT: 'placed-fetch', PAGE_STUDIO_NATIVE_SCHEMA_AUTHORITY: { fetch: receiver } })
const request = (body: unknown = input, address = url, method = 'POST') => new Request(address, {
  method, ...(method === 'POST' ? { body: JSON.stringify(body) } : {})
})
const controlRequest = (body: unknown = input, suffix = '', method = 'POST') => request(body, `https://xeroflow-control.internal${path}${suffix}`, method)
beforeEach(async () => {
  const { command: _command, ...source } = await sourceEffectTransportFixture()
  input = { ...source, purpose: 'recovery-source-freeze-ready', freezeDescriptor: descriptor }
  management = config()
  vi.clearAllMocks()
  vi.stubGlobal('fetch', upstream)
  mocks.authorize.mockImplementation(async value => ({ purpose: value.purpose, envelopeDigest: await collectionDigest(value) }))
})
afterEach(() => vi.unstubAllGlobals())
it('places only read-only readiness through the private binding and configured descriptor', async () => {
  const response = await control.fetch(controlRequest(), env() as never)
  const digest = await collectionDigest(input)
  expect(response.status).toBe(200)
  expect(response.headers.get('cache-control')).toBe('no-store')
  expect(response.headers.get('x-request-digest')).toBe(digest)
  expect(await response.json()).toEqual({ purpose: 'recovery-source-freeze-ready', envelopeDigest: digest })
  expect(mocks.authorize).toHaveBeenCalledExactlyOnceWith(input, { env: management, runTransaction: run, freezeDescriptor: descriptor })
  expect(receiver).toHaveBeenCalledOnce()
  expect(upstream).not.toHaveBeenCalled()
  expect(run).not.toHaveBeenCalled() // The mocked authority alone owns transactions.
})
it.each([undefined, '', '{', '{}', JSON.stringify({ ...descriptor, execute: true }), JSON.stringify({ ...descriptor, layoutDigest: '0'.repeat(64) })])('denies absent or mismatched trusted freeze policy %s', async (policy) => {
  const response = await handleTransferRecoverySourceReadyFetch(request(), { ...management, MANAGED_TRANSFER_RECOVERY_SOURCE_FREEZE_POLICY: policy }, run)
  expect(response.status).toBe(503)
  expect(mocks.authorize).not.toHaveBeenCalled()
})
it.each(['NATIVE_SCHEMA_TRANSPORT', 'PAGE_STUDIO_NATIVE_SCHEMA_AUTHORITY'])('denies missing %s without public fallback', async (key) => {
  expect((await control.fetch(controlRequest(), { ...env(), [key]: undefined } as never)).status).toBe(503)
  expect(upstream).not.toHaveBeenCalled()
  expect(mocks.authorize).not.toHaveBeenCalled()
})
it('rejects alternate public origins, queries, methods and URLs', async () => {
  expect((await control.fetch(controlRequest(), { ...env(), DASHBOARD_ORIGIN: 'https://preview.agency-dashboard-6cm.pages.dev' } as never)).status).toBe(503)
  expect((await control.fetch(controlRequest(input, '?force=1'), env() as never)).status).toBe(400)
  expect((await control.fetch(controlRequest(input, '', 'GET'), env() as never)).status).toBe(400)
  for (const address of [url + '?force=1', 'https://public.example/transfer-recovery-source-ready']) {
    expect((await handleTransferRecoverySourceReadyFetch(request(input, address), management, run)).status).toBe(404)
  }
  expect((await handleTransferRecoverySourceReadyFetch(request(input, url, 'GET'), management, run)).status).toBe(404)
  expect(receiver).not.toHaveBeenCalled()
  expect(mocks.authorize).not.toHaveBeenCalled()
  expect(upstream).not.toHaveBeenCalled()
})
it.each(['command', 'purpose', 'operator', 'extra'])('rejects malformed or effect-bearing envelopes: %s', async (kind) => {
  const value = kind === 'command'
    ? { ...input, command: { verb: 'claim' } }
    : kind === 'purpose'
      ? { ...input, purpose: 'recovery-source-freeze' }
      : kind === 'operator' ? { ...input, inspection: {} } : { ...input, acquired: true }
  expect((await control.fetch(controlRequest(value), env() as never)).status).toBe(400)
  expect((await handleTransferRecoverySourceReadyFetch(request(value), management, run)).status).toBe(400)
  expect(mocks.authorize).not.toHaveBeenCalled()
})
it('bounds streamed bodies and rejects invalid UTF-8 before authorization', async () => {
  for (const body of [' '.repeat(16385), '{', new Uint8Array([255])]) {
    expect((await handleTransferRecoverySourceReadyFetch(new Request(url, { method: 'POST', body }), management, run)).status).toBe(400)
  }
  expect(mocks.authorize).not.toHaveBeenCalled()
})
it.each(['PAGE_STUDIO_RELEASE_ENVIRONMENT', 'PAGE_STUDIO_CUSTOMER_PREVIEW_RUNTIME_ENABLED', 'PAGE_STUDIO_PROVISIONING_ENVIRONMENT',
  'MANAGED_TRANSFER_EXECUTION_POLICY', 'MANAGED_TRANSFER_RECOVERY_EXECUTION_POLICY', 'MANAGED_TRANSFER_RECOVERY_SOURCE_FREEZE_POLICY'])('denies %s changes during body reading and authorization', async (key) => {
  const current: Record<string, unknown> = { ...management }
  const response = handleTransferRecoverySourceReadyFetch(request(), current, run)
  current[key] = 'changed'
  expect((await response).status).toBe(503)
  expect(mocks.authorize).not.toHaveBeenCalled()
  const later: Record<string, unknown> = { ...management }
  mocks.authorize.mockImplementationOnce(async (value) => {
    later[key] = 'changed'
    return { purpose: value.purpose, envelopeDigest: await collectionDigest(value) }
  })
  expect((await handleTransferRecoverySourceReadyFetch(request(), later, run)).status).toBe(503)
})
it.each([400, 401, 403, 409, 500, 503])('redacts authority error %s without retry', async (statusCode) => {
  mocks.authorize.mockRejectedValueOnce({ statusCode, message: 'private sql token' })
  const response = await control.fetch(controlRequest(), env() as never)
  expect(response.status).toBe(statusCode === 500 ? 503 : statusCode)
  expect(await response.text()).not.toContain('private sql token')
  expect(mocks.authorize).toHaveBeenCalledOnce()
  expect(receiver).toHaveBeenCalledOnce()
  expect(upstream).not.toHaveBeenCalled()
})
it.each(['redirect', 'oversized', 'utf8', 'wrong-purpose', 'wrong-digest', 'extra', 'throw'])('rejects invalid binding response %s without fallback', async (kind) => {
  const fetch = vi.fn(async () => {
    const digest = await collectionDigest(input), headers = { 'x-request-digest': digest }
    if (kind === 'throw') throw new Error('private')
    if (kind === 'redirect') return new Response(null, { status: 302, headers })
    if (kind === 'oversized') return new Response(' '.repeat(16385), { headers })
    if (kind === 'utf8') return new Response(new Uint8Array([255]), { headers })
    return Response.json({ purpose: kind === 'wrong-purpose' ? 'recovery-source-freeze' : input.purpose,
      envelopeDigest: kind === 'wrong-digest' ? 'e'.repeat(64) : digest, ...(kind === 'extra' ? { acquired: true } : {}) }, { headers })
  })
  expect((await control.fetch(controlRequest(), { ...env(), PAGE_STUDIO_NATIVE_SCHEMA_AUTHORITY: { fetch } } as never)).status).toBe(503)
  expect(fetch).toHaveBeenCalledOnce()
  expect(upstream).not.toHaveBeenCalled()
})
it('denies binding method replacement during body consumption before forwarding', async () => {
  const binding = { fetch: receiver }
  const response = control.fetch(controlRequest(), { ...env(), PAGE_STUDIO_NATIVE_SCHEMA_AUTHORITY: binding } as never)
  binding.fetch = vi.fn()
  expect((await response).status).toBe(503)
  expect(receiver).not.toHaveBeenCalled()
})

it('exposes the fixed readiness callback from the real Management entrypoint', async () => {
  const worker = new Management({} as never, { ...management, HYPERDRIVE_FRESH: { connectionString: 'fixture-only' } } as never)
  const response = await worker.fetch(request())
  expect(response.status).toBe(200)
  expect(mocks.authorize).toHaveBeenCalledOnce()
  expect(mocks.authorize.mock.calls[0][1].runTransaction).toEqual(expect.any(Function))
  expect(upstream).not.toHaveBeenCalled()
})
it.each([{ purpose: 'recovery-source-freeze', envelopeDigest: 'a'.repeat(64) },
  { purpose: 'recovery-source-freeze-ready', envelopeDigest: 'a'.repeat(64) },
  { purpose: 'recovery-source-freeze-ready', envelopeDigest: 'a'.repeat(64), acquired: true }])('rejects false authority acknowledgments', async (result) => {
  mocks.authorize.mockResolvedValueOnce(result)
  expect((await handleTransferRecoverySourceReadyFetch(request(), management, run)).status).toBe(503)
})
it.each(['PAGE_STUDIO_RELEASE_ENVIRONMENT', 'PAGE_STUDIO_CUSTOMER_PREVIEW_RUNTIME_ENABLED'])('denies initially disabled %s even if enabled during body read', async (key) => {
  const current: Record<string, unknown> = { ...management, [key]: 'disabled' }
  const response = handleTransferRecoverySourceReadyFetch(request(), current, run)
  current[key] = management[key as keyof typeof management]
  expect((await response).status).toBe(503)
  expect(mocks.authorize).not.toHaveBeenCalled()
})
it('preserves binding receiver and rejects method replacement while awaiting response', async () => {
  const binding = { fetch: async function (this: unknown, req: Request) {
    expect(this).toBe(binding)
    const response = await receiver(req)
    binding.fetch = async () => new Response('changed')
    return response
  } }
  expect((await control.fetch(controlRequest(), { ...env(), PAGE_STUDIO_NATIVE_SCHEMA_AUTHORITY: binding } as never)).status).toBe(503)
  expect(receiver).toHaveBeenCalledOnce()
})
