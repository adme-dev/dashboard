import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import control from '../../workers/page-studio-control/src/index'
import Management from '../../workers/page-studio-management/src/index'
import { NATIVE_RUNTIME_RECOVERY_AUTHORITY_PATH as path, NATIVE_RUNTIME_RECOVERY_AUTHORITY_URL as target } from '../../shared/pageStudio/nativeRuntimeRecoveryWire'

const mocks = vi.hoisted(() => ({ authorize: vi.fn(), operator: vi.fn(), transaction: vi.fn(), upstream: vi.fn() }))
vi.mock('cloudflare:workers', () => ({ WorkerEntrypoint: class {
  env: unknown
  constructor(_ctx: unknown, env: unknown) { this.env = env }
} }))
vi.mock('../../workers/page-studio-management/src/nativeRuntimeRecovery', () => ({
  authorizeNativeRuntimeRecovery: mocks.authorize, handleNativeRuntimeRecoveryOperator: mocks.operator
}))
vi.mock('../../workers/page-studio-management/src/database', () => ({ withManagementTransaction: mocks.transaction }))
const reference = { expectedControlPlaneEnvironment: 'production', phase: 'create', reviewId: '10000000-0000-4000-8000-000000000001', attemptId: '10000000-0000-4000-8000-000000000002', reviewDigest: 'a'.repeat(64) }
const request = (body: unknown = reference, method = 'POST') => new Request(`https://control.internal${path}`, {
  method, headers: { authorization: 'Bearer must-not-forward', cookie: 'private=must-not-forward' },
  ...(method === 'POST' ? { body: JSON.stringify(body) } : {})
})
function fixture(extra: Record<string, unknown> = {}) {
  const management = new Management({} as never, { PAGE_STUDIO_RELEASE_ENVIRONMENT: 'production' } as never)
  const binding = { fetch: vi.fn((input: Request) => management.fetch(input)) }
  const env = { PAGE_STUDIO_CONTROL_SECRET: 's'.repeat(48), DASHBOARD_ORIGIN: 'https://app.xeroflow.io',
    NATIVE_SCHEMA_TRANSPORT: 'placed-fetch', PAGE_STUDIO_NATIVE_SCHEMA_AUTHORITY: binding, ...extra } as Parameters<typeof control.fetch>[1]
  return { env, management, binding }
}
beforeEach(() => {
  vi.resetAllMocks()
  vi.stubGlobal('fetch', mocks.upstream)
  mocks.authorize.mockImplementation(async input => ({ reference: input, approval: null }))
})
afterEach(() => vi.unstubAllGlobals())
it('uses only the fixed private receiver and repeats fresh authority for identical calls', async () => {
  const f = fixture()
  for (let i = 0; i < 2; i++) {
    const response = await control.fetch(request(), f.env)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ reference, approval: null })
  }
  const sent = f.binding.fetch.mock.calls[0]![0]
  expect(sent.url).toBe(target)
  expect(sent.redirect).toBe('manual')
  expect(sent.headers.get('cookie')).toBeNull()
  expect(sent.headers.get('authorization')).toBeNull()
  expect(mocks.authorize).toHaveBeenCalledTimes(2)
  expect(mocks.upstream).not.toHaveBeenCalled()
})
it.each([
  { NATIVE_SCHEMA_TRANSPORT: undefined }, { NATIVE_SCHEMA_TRANSPORT: 'wrong' },
  { PAGE_STUDIO_NATIVE_SCHEMA_AUTHORITY: undefined },
  { DASHBOARD_ORIGIN: 'https://preview.agency-dashboard-6cm.pages.dev' }
])('denies missing or foreign transport configuration without fallback', async (extra) => {
  expect((await control.fetch(request(), fixture(extra).env)).status).toBe(503)
  expect(mocks.authorize).not.toHaveBeenCalled()
  expect(mocks.upstream).not.toHaveBeenCalled()
})
it.each([{ ...reference, operator: 'forged' }, { ...reference, expectedControlPlaneEnvironment: 'staging' }, { padding: 'x'.repeat(1025) }])('denies malformed and oversized callbacks before authority', async (input) => {
  expect((await control.fetch(request(input), fixture().env)).status).toBe(503)
  expect(mocks.authorize).not.toHaveBeenCalled()
  expect(mocks.upstream).not.toHaveBeenCalled()
})
it('rejects missing receipt, foreign reference and oversized replies without public fallback', async () => {
  const f = fixture()
  expect((await control.fetch(request({ ...reference, phase: 'advance' }), f.env)).status).toBe(503)
  mocks.authorize.mockResolvedValueOnce({ reference: { ...reference, reviewDigest: 'b'.repeat(64) }, approval: null })
  expect((await control.fetch(request(), f.env)).status).toBe(503)
  const oversized = fixture({ PAGE_STUDIO_NATIVE_SCHEMA_AUTHORITY: { fetch: async () => new Response(' '.repeat(4097)) } })
  expect((await control.fetch(request(), oversized.env)).status).toBe(503)
  expect(mocks.upstream).not.toHaveBeenCalled()
})
it('keeps unrelated origins, paths and private GETs closed', async () => {
  const f = fixture()
  for (const url of ['https://public.invalid/', 'https://public.invalid/native-runtime-recovery-authority', target + '?extra=1', target]) {
    const response = await f.management.fetch(new Request(url))
    expect(response.status).toBe(404)
    expect(await response.text()).toBe('Not found')
  }
  expect(mocks.authorize).not.toHaveBeenCalled()
  expect(mocks.transaction).not.toHaveBeenCalled()
})
it('sanitizes authority uncertainty and never retries', async () => {
  mocks.authorize.mockRejectedValueOnce(new Error('postgres://private-session'))
  const response = await control.fetch(request(), fixture().env)
  expect(response.status).toBe(503)
  expect(await response.text()).not.toContain('private-session')
  expect(mocks.authorize).toHaveBeenCalledOnce()
  expect(mocks.upstream).not.toHaveBeenCalled()
})
