import { beforeEach, expect, it, vi } from 'vitest'
import Management from '../../workers/page-studio-management/src/index'
import { handleCmsStatusFetch } from '../../workers/page-studio-management/src/cmsStatus'
import { CMS_STATUS_URL } from '../../shared/pageStudio/cmsManagementContract'
import { collectionDigest } from '../../shared/pageStudio/collectionApi'
import { CUSTOMER_EDITOR_CAPABILITIES } from '../../server/utils/pageStudio/customerEditorToken'
import { nativePreviewBindings } from '../utils/pageStudioNativePreview'

const dispatch = vi.hoisted(() => vi.fn())
const transaction = vi.hoisted(() => vi.fn())
vi.mock('../../workers/page-studio-management/src/cmsManagement', () => ({ handleCmsManagement: dispatch }))
vi.mock('../../workers/page-studio-management/src/database', () => ({ withManagementTransaction: transaction }))
vi.mock('cloudflare:workers', () => ({ WorkerEntrypoint: class {
  env: unknown
  constructor(_ctx: unknown, env: unknown) { this.env = env }
} }))
const id = '10000000-0000-4000-8000-000000000001'
const input = () => ({ operation: 'adoption', body: { action: 'status' }, expectedEnvironment: 'production', contentEnvironment: 'staging',
  principal: { source: 'customer-session', capability: 'workspace:create', claims: {
    role: 'customer', environment: 'staging', nonce: id, userId: id, workspaceId: id, clientId: id, siteId: id, tenantId: 'native',
    capabilities: [...CUSTOMER_EDITOR_CAPABILITIES], issuedAt: 1700000000, expiresAt: 1700000900,
    editorOrigin: 'https://studio-customer-preview.xeroflow.io', returnUrl: 'https://app.xeroflow.io/studio/dashboard' } } })
const env = () => ({ ...nativePreviewBindings(), PAGE_STUDIO_RELEASE_ENVIRONMENT: 'production', HYPERDRIVE_FRESH: { connectionString: 'synthetic-private-connection' } })
const request = (value: unknown = input(), url = CMS_STATUS_URL) => new Request(url, { method: 'POST', body: JSON.stringify(value) })
const run = vi.fn()
beforeEach(() => {
  vi.clearAllMocks()
  dispatch.mockImplementation(async value => ({ ok: true, requestDigest: await collectionDigest(value), value: { phase: 'managed' } }))
})
it('delegates the original detached status and runner without an outer transaction', async () => {
  const configuration = env(), value = input()
  const response = await handleCmsStatusFetch(request(value), configuration, run)
  expect(response.status).toBe(200)
  expect(response.headers.get('x-request-digest')).toBe(await collectionDigest(value))
  expect(response.headers.get('cache-control')).toBe('no-store')
  expect(dispatch).toHaveBeenCalledExactlyOnceWith(value, configuration, run)
  expect(run).not.toHaveBeenCalled()
})
it.each([['CMS_AUTHORITY_BUSY', 503], ['CMS_AUTHORITY_DENIED', 403], ['CMS_ADOPTION_CONFLICT', 409]] as const)('preserves typed %s as the original HTTP200 envelope', async (code, statusCode) => {
  const result = { ok: false, requestDigest: await collectionDigest(input()), error: { code, statusCode, message: 'Safe original result' } }
  dispatch.mockResolvedValueOnce(result)
  const response = await handleCmsStatusFetch(request(), env(), run)
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual(result)
})
it.each([CMS_STATUS_URL + '?x=1', CMS_STATUS_URL + '/extra', 'https://foreign.invalid/customer-cms-adoption-status'])('rejects URL %s before dispatch', async (url) => {
  expect((await handleCmsStatusFetch(request(undefined, url), env(), run)).status).toBe(404)
  expect(dispatch).not.toHaveBeenCalled()
})
it('rejects method, malformed, oversized and invalid UTF8 before dispatch', async () => {
  expect((await handleCmsStatusFetch(new Request(CMS_STATUS_URL), env(), run)).status).toBe(404)
  for (const body of ['{', ' '.repeat(16385), new Uint8Array([255])]) {
    expect((await handleCmsStatusFetch(new Request(CMS_STATUS_URL, { method: 'POST', body }), env(), run)).status).toBe(400)
  }
  expect(dispatch).not.toHaveBeenCalled()
})
it.each(['start', 'advance', 'recover', 'operation', 'expected', 'content', 'claims', 'principal', 'capability', 'extra', 'extra-body'])('rejects %s before dispatch', async (kind) => {
  const value = input()
  if (['start', 'advance', 'recover'].includes(kind)) value.body.action = kind
  if (kind === 'operation') value.operation = 'checkpoint'
  if (kind === 'expected') value.expectedEnvironment = 'staging'
  if (kind === 'content') value.contentEnvironment = 'production'
  if (kind === 'claims') value.principal.claims.environment = 'production'
  if (kind === 'principal') value.principal.source = 'studio-session'
  if (kind === 'capability') value.principal.capability = 'workspace:checkpoint'
  if (kind === 'extra') Object.assign(value, { env: {} })
  if (kind === 'extra-body') Object.assign(value.body, { siteId: id })
  const response = await handleCmsStatusFetch(request(value), env(), run)
  expect(response.status).toBe(400)
  expect(response.headers.get('x-request-digest')).toBe(await collectionDigest(value))
  expect(dispatch).not.toHaveBeenCalled()
})
it.each(['release', 'flag', 'router', 'bucket'])('rejects native configuration %s before dispatch', async (kind) => {
  const configuration: Record<string, unknown> = env()
  if (kind === 'release') configuration.PAGE_STUDIO_RELEASE_ENVIRONMENT = 'staging'
  if (kind === 'flag') delete configuration.PAGE_STUDIO_CUSTOMER_PREVIEW_RUNTIME_ENABLED
  if (kind === 'router') delete configuration.PAGE_STUDIO_CUSTOMER_PREVIEW_CONTENT_ROUTER
  if (kind === 'bucket') delete configuration.PAGE_STUDIO_CUSTOMER_PREVIEW_CHECKPOINTS
  expect((await handleCmsStatusFetch(request(), configuration, run)).status).toBe(503)
  expect(dispatch).not.toHaveBeenCalled()
})
it('routes default fetch through the existing fresh runner and redacts unexpected errors', async () => {
  const worker = new Management({} as never, env() as never)
  const db = { query: vi.fn() }, work = vi.fn(async () => 'original status')
  transaction.mockImplementationOnce(async (_connection, callback) => callback(db))
  dispatch.mockImplementationOnce(async (_value, _env, runner) => runner(work))
  expect((await worker.fetch(request())).status).toBe(200)
  expect(transaction).toHaveBeenCalledOnce()
  expect(transaction.mock.calls[0]![0]).toBe('synthetic-private-connection')
  expect(work).toHaveBeenCalledExactlyOnceWith(db)
  dispatch.mockRejectedValueOnce(new Error('synthetic-private-error'))
  const response = await handleCmsStatusFetch(request(), env(), run)
  expect(response.status).toBe(503)
  expect(await response.text()).not.toContain('synthetic-private-error')
})
