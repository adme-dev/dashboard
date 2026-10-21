import Management from '../../workers/page-studio-management/src/index'
import { beforeEach, expect, it, vi } from 'vitest'
import { handleCustomerEditorAuthorityFetch } from '../../workers/page-studio-management/src/customerEditorAuthority'
import { authorizePlacedCustomerEditor } from '../../server/utils/pageStudio/customerEditorAuthorityClient'
import { CUSTOMER_EDITOR_AUTHORITY_URL as URL, CUSTOMER_EDITOR_AUTHORITY_ERROR as ERROR } from '../../shared/pageStudio/customerEditorAuthorityTransport'
import { CUSTOMER_EDITOR_CAPABILITIES, type CustomerEditorClaims } from '../../server/utils/pageStudio/customerEditorToken'
import { destinationActivation } from '../helpers/pageStudioDestinationActivation'

const authority = vi.hoisted(() => vi.fn())
const transaction = vi.hoisted(() => vi.fn())
vi.mock('cloudflare:workers', () => ({ WorkerEntrypoint: class {
  env: unknown
  constructor(_ctx: unknown, env: unknown) { this.env = env }
} }))
vi.mock('../../workers/page-studio-management/src/database', () => ({ withManagementTransaction: transaction }))
vi.mock('../../server/utils/pageStudio/customerEditorSessionAuthority', () => ({ assertCustomerEditorSessionAuthority: authority }))
const id = '10000000-0000-4000-8000-000000000001'
const claims = (environment: 'staging' | 'production' = 'staging'): CustomerEditorClaims => ({ role: 'customer', environment, nonce: id, userId: id, workspaceId: id, clientId: id, siteId: id, tenantId: 'native', capabilities: [...CUSTOMER_EDITOR_CAPABILITIES], issuedAt: 1_700_000_000, expiresAt: 1_700_000_900, editorOrigin: environment === 'production' ? 'https://studio.example.test' : 'https://studio-customer-preview.xeroflow.io', returnUrl: 'https://app.xeroflow.io/studio/dashboard' })
const env = () => ({ ...destinationActivation(id), PAGE_STUDIO_RELEASE_ENVIRONMENT: 'production', PAGE_STUDIO_CUSTOMER_PREVIEW_RUNTIME_ENABLED: 'true', PAGE_STUDIO_CUSTOMER_PREVIEW_EDITOR_ORIGIN: claims().editorOrigin, PAGE_STUDIO_CUSTOMER_PREVIEW_PROVISIONER: { createProvisioning() {}, readProvisioning() {} }, PAGE_STUDIO_CUSTOMER_PREVIEW_CONTENT_ROUTER: { readManagedCmsTarget() {} }, PAGE_STUDIO_CUSTOMER_PREVIEW_CHECKPOINTS: { get() {} } })
const request = (value: unknown = { expectedControlPlaneEnvironment: 'production', claims: claims(), capability: 'workspace:reconnect' }, url = URL) => new Request(url, { method: 'POST', body: JSON.stringify(value) })
const db = { query: vi.fn() }, run = vi.fn(async work => work(db))
beforeEach(() => {
  vi.clearAllMocks()
  authority.mockResolvedValue({})
  run.mockImplementation(async work => work(db))
})
it.each(['staging', 'production'] as const)('preserves fresh %s authority on every invocation and exact receipt', async (environment) => {
  const fetch = vi.fn((request: Request) => handleCustomerEditorAuthorityFetch(request, env(), run)), value = claims(environment)
  for (const capability of ['workspace:reconnect', 'workspace:preview'] as const) await authorizePlacedCustomerEditor(value, capability, { fetch })
  expect(run).toHaveBeenCalledTimes(2)
  expect(authority.mock.calls).toEqual([[value, 'workspace:reconnect', db], [value, 'workspace:preview', db]])
  authority.mockRejectedValueOnce({ statusCode: 403 })
  await expect(authorizePlacedCustomerEditor(value, 'workspace:preview', { fetch })).rejects.toMatchObject({ statusCode: 403 })
  expect(run).toHaveBeenCalledTimes(3)
})
it.each([undefined, {}, { fetch: null }])('missing client binding fails closed', async (binding) => {
  await expect(authorizePlacedCustomerEditor(claims(), 'workspace:preview', binding)).rejects.toMatchObject({ statusCode: 503 })
  expect(run).not.toHaveBeenCalled()
})
it.each([URL + '?x=1', URL + '/extra', 'https://foreign.invalid/customer-editor-authority'])('wrong URL denied without authority: %s', async (url) => {
  expect((await handleCustomerEditorAuthorityFetch(request(undefined, url), env(), run)).status).toBe(404)
  expect(run).not.toHaveBeenCalled()
})
it('denies GET and malformed/oversized/invalid UTF8 envelope without authority', async () => {
  expect((await handleCustomerEditorAuthorityFetch(new Request(URL), env(), run)).status).toBe(404)
  for (const body of ['{', ' '.repeat(16385), new Uint8Array([255]), JSON.stringify({ expectedControlPlaneEnvironment: 'production', claims: claims(), capability: 'workspace:preview', extra: true })]) {
    expect((await handleCustomerEditorAuthorityFetch(new Request(URL, { method: 'POST', body }), env(), run)).status).toBe(400)
  }
  expect(run).not.toHaveBeenCalled()
})
it.each(['release', 'previewFlag', 'previewBinding', 'activation', 'returnUrl', 'origin', 'capability', 'foreignWorkspace', 'productionExpired'])('rejects %s before database work', async (failure) => {
  const configuration: Record<string, unknown> = env(), value = claims(['foreignWorkspace', 'productionExpired'].includes(failure) ? 'production' : 'staging')
  if (failure === 'release') configuration.PAGE_STUDIO_RELEASE_ENVIRONMENT = 'staging'
  if (failure === 'previewFlag') delete configuration.PAGE_STUDIO_CUSTOMER_PREVIEW_RUNTIME_ENABLED
  if (failure === 'previewBinding') delete configuration.PAGE_STUDIO_CUSTOMER_PREVIEW_CHECKPOINTS
  if (failure === 'activation') configuration.PAGE_STUDIO_CUSTOMER_ACTIVATION = '{}'
  if (failure === 'returnUrl') value.returnUrl = 'https://foreign.invalid/studio/dashboard'
  if (failure === 'origin') value.editorOrigin = 'https://foreign.invalid'
  if (failure === 'capability') value.capabilities = ['workspace:status']
  if (failure === 'foreignWorkspace') value.workspaceId = '20000000-0000-4000-8000-000000000001'
  if (failure === 'productionExpired') Object.assign(configuration, destinationActivation(id, '2020-01-01T00:00:00Z'))
  const response = await handleCustomerEditorAuthorityFetch(request({ expectedControlPlaneEnvironment: 'production', claims: value, capability: 'workspace:preview' }), configuration, run)
  expect([403, 503]).toContain(response.status)
  expect(run).not.toHaveBeenCalled()
})
it.each(['staging', 'production'] as const)('rechecks %s activation after the transaction', async (environment) => {
  const configuration = env()
  run.mockImplementationOnce(async (work) => {
    await work(db)
    configuration.PAGE_STUDIO_CUSTOMER_ACTIVATION = '{}'
    return undefined
  })
  expect((await handleCustomerEditorAuthorityFetch(request({ expectedControlPlaneEnvironment: 'production', claims: claims(environment), capability: 'workspace:preview' }), configuration, run)).status).toBe(403)
  expect(authority).toHaveBeenCalledOnce()
})
it.each(['redirect', 'throw', 'malformed', 'oversized', 'invalidUTF8', 'digest', 'nonce', 'capability', 'extra', 'successError', 'unboundError'])('client rejects %s without retry or leaking upstream details', async (failure) => {
  const fetch = vi.fn(async (request: Request) => {
    if (failure === 'throw') throw new Error('synthetic-credential-secret')
    const response = await handleCustomerEditorAuthorityFetch(request, env(), run), headers = new Headers(response.headers)
    const value = await response.json() as Record<string, unknown>
    if (failure === 'digest' || failure === 'unboundError') headers.set('x-request-digest', 'a'.repeat(64))
    if (failure === 'nonce') value.sessionId = '20000000-0000-4000-8000-000000000001'
    if (failure === 'capability') value.capability = 'workspace:status'
    if (failure === 'extra') value.private = 'synthetic-credential-secret'
    const body = failure === 'malformed' ? 'synthetic-credential-secret' : failure === 'oversized' ? ' '.repeat(16385) : failure === 'invalidUTF8' ? new Uint8Array([255]) : JSON.stringify(failure === 'unboundError' ? ERROR : value)
    return new Response(body, { headers, status: failure === 'redirect' ? 302 : ['successError', 'unboundError'].includes(failure) ? 403 : 200 })
  })
  await expect(authorizePlacedCustomerEditor(claims(), 'workspace:preview', { fetch })).rejects.toMatchObject({ statusCode: 503, statusMessage: ERROR })
  expect(fetch).toHaveBeenCalledOnce()
})
it.each([400, 401, 403, 409, 500])('preserves allowlisted failure %s with fixed message', async (statusCode) => {
  run.mockRejectedValueOnce({ statusCode, message: 'synthetic-credential-secret' })
  const fetch = vi.fn((request: Request) => handleCustomerEditorAuthorityFetch(request, env(), run))
  await expect(authorizePlacedCustomerEditor(claims(), 'workspace:preview', { fetch })).rejects.toMatchObject({ statusCode: statusCode === 500 ? 503 : statusCode, statusMessage: ERROR })
  expect(fetch).toHaveBeenCalledOnce()
})
it('detaches mutable caller claims before any asynchronous work', async () => {
  const value = claims(), fetch = vi.fn((request: Request) => handleCustomerEditorAuthorityFetch(request, env(), run))
  const operation = authorizePlacedCustomerEditor(value, 'workspace:preview', { fetch })
  value.nonce = '20000000-0000-4000-8000-000000000001'
  await operation
  expect(authority.mock.calls[0]![0].nonce).toBe(id)
})

it('dispatches the fixed default fetch path through the fresh management transaction runner', async () => {
  transaction.mockImplementation(async (_connection, work) => work(db))
  const TestWorker = Management as unknown as new (context: unknown, environment: unknown) => Management
  const worker = new TestWorker({} as never, { ...env(), HYPERDRIVE_FRESH: { connectionString: 'local-test-only' } } as never)
  const response = await worker.fetch(request())
  expect(response.status).toBe(200)
  expect(transaction).toHaveBeenCalledExactlyOnceWith('local-test-only', expect.any(Function))
  expect(authority).toHaveBeenCalledExactlyOnceWith(claims(), 'workspace:reconnect', db)
})
