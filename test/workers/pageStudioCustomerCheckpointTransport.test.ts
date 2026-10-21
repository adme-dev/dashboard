import Management from '../../workers/page-studio-management/src/index'
import { beforeEach, expect, it, vi } from 'vitest'
import { handleCustomerEditorAuthorityFetch } from '../../workers/page-studio-management/src/customerEditorAuthority'
import { readPlacedCustomerEditorCheckpoint } from '../../server/utils/pageStudio/customerEditorAuthorityClient'
import { CUSTOMER_EDITOR_CHECKPOINT_URL as URL } from '../../shared/pageStudio/customerEditorAuthorityTransport'
import { CUSTOMER_EDITOR_CAPABILITIES } from '../../server/utils/pageStudio/customerEditorToken'

const mocks = vi.hoisted(() => ({ authority: vi.fn(), latest: vi.fn(), transaction: vi.fn() }))
vi.mock('cloudflare:workers', () => ({ WorkerEntrypoint: class {
  env: unknown
  constructor(_ctx: unknown, env: unknown) { this.env = env }
} }))
vi.mock('../../workers/page-studio-management/src/database', () => ({ withManagementTransaction: mocks.transaction }))
vi.mock('../../server/utils/pageStudio/customerEditorSessionAuthority', async importOriginal => ({
  ...await importOriginal<object>(), assertCustomerEditorSessionAuthority: mocks.authority
}))
vi.mock('../../server/utils/pageStudio/checkpointRead', () => ({ getLatestPageStudioCheckpoint: mocks.latest }))
const id = '10000000-0000-4000-8000-000000000001'
const claims = () => ({ role: 'customer' as const, environment: 'staging' as const, nonce: id, userId: id,
  workspaceId: id, clientId: id, siteId: id, tenantId: 'native', capabilities: [...CUSTOMER_EDITOR_CAPABILITIES],
  issuedAt: 1_700_000_000, expiresAt: 1_700_000_900, editorOrigin: 'https://studio-customer-preview.xeroflow.io',
  returnUrl: 'https://app.xeroflow.io/studio/dashboard' })
const checkpoint = { checkpointId: id, digest: 'a'.repeat(64), objectKey: 'private/checkpoint.json' }
const env = () => ({ PAGE_STUDIO_RELEASE_ENVIRONMENT: 'production', PAGE_STUDIO_CUSTOMER_EDITOR_ENABLED: 'true',
  PAGE_STUDIO_CUSTOMER_PREVIEW_RUNTIME_ENABLED: 'true', PAGE_STUDIO_CUSTOMER_PREVIEW_EDITOR_ORIGIN: claims().editorOrigin,
  PAGE_STUDIO_CUSTOMER_PREVIEW_PROVISIONER: { createProvisioning() {}, readProvisioning() {} },
  PAGE_STUDIO_CUSTOMER_PREVIEW_CONTENT_ROUTER: { readManagedCmsTarget() {} }, PAGE_STUDIO_CUSTOMER_PREVIEW_CHECKPOINTS: { get() {} } })
const db = { query: vi.fn() }, run = vi.fn(async work => work(db))
const request = (value: unknown = { expectedControlPlaneEnvironment: 'production', claims: claims(), capability: 'workspace:reconnect' }) =>
  new Request(URL, { method: 'POST', body: JSON.stringify(value) })
beforeEach(() => {
  vi.clearAllMocks()
  mocks.authority.mockResolvedValue({})
  mocks.latest.mockResolvedValue(checkpoint)
  run.mockImplementation(async work => work(db))
})
it.each([checkpoint, null])('uses exactly one placed transaction with both fresh fences and pinned metadata: %j', async (value) => {
  const calls: string[] = []
  mocks.authority.mockImplementation(async () => { calls.push('authority') })
  mocks.latest.mockImplementation(async (_scope, deps) => {
    calls.push('metadata')
    db.query.mockResolvedValueOnce({ rows: [value] })
    expect(await deps.queryOne('fixed', [])).toEqual(value)
    return value
  })
  const fetch = vi.fn((input: Request) => handleCustomerEditorAuthorityFetch(input, env(), run))
  expect(await readPlacedCustomerEditorCheckpoint(claims(), { fetch })).toEqual(value)
  expect(calls).toEqual(['authority', 'metadata', 'authority'])
  expect(run).toHaveBeenCalledOnce()
  expect(fetch).toHaveBeenCalledOnce()
  expect(mocks.authority.mock.calls).toEqual([[claims(), 'workspace:reconnect', db], [claims(), 'workspace:reconnect', db]])
})
it.each([1, 2])('denies revocation at fresh fence %i without retry', async (fence) => {
  mocks.authority.mockImplementation(async () => {
    if (mocks.authority.mock.calls.length === fence) throw { statusCode: 403 }
  })
  const fetch = vi.fn((input: Request) => handleCustomerEditorAuthorityFetch(input, env(), run))
  await expect(readPlacedCustomerEditorCheckpoint(claims(), { fetch })).rejects.toMatchObject({ statusCode: 403 })
  expect(run).toHaveBeenCalledOnce()
  expect(fetch).toHaveBeenCalledOnce()
  expect(mocks.latest).toHaveBeenCalledTimes(fence - 1)
})
it.each(['production', 'capability', 'release', 'disabled', 'origin', 'extra'])('rejects %s before SQL', async (failure) => {
  const input: { expectedControlPlaneEnvironment: string, claims: Omit<ReturnType<typeof claims>, 'environment'> & { environment: string }, capability: string, extra?: boolean } = { expectedControlPlaneEnvironment: 'production', claims: claims(), capability: 'workspace:reconnect' }
  const configuration = env()
  if (failure === 'production') input.claims.environment = 'production'
  if (failure === 'capability') input.capability = 'workspace:create'
  if (failure === 'release') configuration.PAGE_STUDIO_RELEASE_ENVIRONMENT = 'staging'
  if (failure === 'disabled') configuration.PAGE_STUDIO_CUSTOMER_PREVIEW_RUNTIME_ENABLED = 'false'
  if (failure === 'origin') input.claims.editorOrigin = 'https://foreign.invalid'
  if (failure === 'extra') input.extra = true
  expect((await handleCustomerEditorAuthorityFetch(request(input), configuration, run)).status).not.toBe(200)
  expect(run).not.toHaveBeenCalled()
})
it.each(['extra', 'missing', 'invalid', 'digest', 'throw', 'oversize'])('rejects %s response without retry', async (failure) => {
  const fetch = vi.fn(async (input: Request) => {
    if (failure === 'throw') throw new Error('private-provider-detail')
    const response = await handleCustomerEditorAuthorityFetch(input, env(), run)
    const headers = new Headers(response.headers)
    if (failure === 'digest') headers.set('x-request-digest', 'b'.repeat(64))
    const value = failure === 'extra' ? { ...checkpoint, extra: true } : failure === 'missing' ? { digest: checkpoint.digest }
      : failure === 'invalid' ? { ...checkpoint, checkpointId: 5 } : checkpoint
    return new Response(failure === 'oversize' ? ' '.repeat(16385) : JSON.stringify(value), { headers })
  })
  await expect(readPlacedCustomerEditorCheckpoint(claims(), { fetch })).rejects.toMatchObject({ statusCode: 503 })
  expect(fetch).toHaveBeenCalledOnce()
})
it('captures the bound service and detached claims before the first await', async () => {
  const input = claims(), expected = structuredClone(input)
  const binding = { marker: true, fetch: vi.fn(async function (this: { marker: boolean }, request: Request) {
    expect(this).toBe(binding)
    expect((await request.clone().json() as { claims: unknown }).claims).toEqual(expected)
    return handleCustomerEditorAuthorityFetch(request, env(), run)
  }) }
  const result = readPlacedCustomerEditorCheckpoint(input, binding)
  input.siteId = '20000000-0000-4000-8000-000000000001'
  const original = binding.fetch
  binding.fetch = vi.fn(() => { throw new Error('replacement') }) as never
  expect(await result).toEqual(checkpoint)
  expect(original).toHaveBeenCalledOnce()
  expect(binding.fetch).not.toHaveBeenCalled()
})

it.each([undefined, {}, { fetch: null }])('missing binding fails closed before SQL: %j', async (binding) => {
  await expect(readPlacedCustomerEditorCheckpoint(claims(), binding)).rejects.toMatchObject({ statusCode: 503 })
  expect(run).not.toHaveBeenCalled()
})
it.each([URL + '?extra=1', URL + '/extra', 'https://foreign.invalid/customer-editor-checkpoint'])('rejects non-exact route %s', async (url) => {
  expect((await handleCustomerEditorAuthorityFetch(new Request(url, { method: 'POST', body: '{}' }), env(), run)).status).toBe(404)
  expect(run).not.toHaveBeenCalled()
})
it('rechecks deployment activation after the native metadata transaction', async () => {
  const configuration = env()
  run.mockImplementationOnce(async (work) => {
    const result = await work(db)
    configuration.PAGE_STUDIO_CUSTOMER_EDITOR_ENABLED = 'false'
    return result
  })
  await expect(readPlacedCustomerEditorCheckpoint(claims(), {
    fetch: (request: Request) => handleCustomerEditorAuthorityFetch(request, configuration, run)
  })).rejects.toMatchObject({ statusCode: 403 })
  expect(mocks.authority).toHaveBeenCalledTimes(2)
})
it.each([{ digest: 'A'.repeat(64) }, { objectKey: '' }, { objectKey: 'x'.repeat(1025) }, { checkpointId: '../other' }])('retains checkpoint wire constraints %j', async (changed) => {
  mocks.latest.mockResolvedValue({ ...checkpoint, ...changed })
  await expect(readPlacedCustomerEditorCheckpoint(claims(), {
    fetch: (request: Request) => handleCustomerEditorAuthorityFetch(request, env(), run)
  })).rejects.toMatchObject({ statusCode: 503 })
})

it('dispatches fixed latest reads through the fresh Management runner exactly once', async () => {
  mocks.transaction.mockImplementation(async (_connection, work) => work(db))
  const TestWorker = Management as unknown as new (context: unknown, environment: unknown) => Management
  const worker = new TestWorker({}, { ...env(), HYPERDRIVE_FRESH: { connectionString: 'local-test-only' } })
  const response = await worker.fetch(request())
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual(checkpoint)
  expect(mocks.transaction).toHaveBeenCalledExactlyOnceWith('local-test-only', expect.any(Function))
  expect(mocks.authority).toHaveBeenCalledTimes(2)
})
