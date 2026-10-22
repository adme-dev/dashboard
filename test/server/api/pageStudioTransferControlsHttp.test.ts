import { randomUUID } from 'node:crypto'
import { createApp, createRouter, toWebHandler, createError, eventHandler } from 'h3'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ auth: vi.fn(), operator: vi.fn(), login: vi.fn(), bind: vi.fn(), session: vi.fn(), controls: vi.fn(), workflow: vi.fn(), inspect: vi.fn(), limit: vi.fn() }))
vi.mock('~~/server/utils/auth', () => ({ requireAuth: mocks.auth }))
vi.mock('~~/server/utils/db', () => ({ transactionWithoutRetry: async work => work({}), transaction: async work => work({}) }))
vi.mock('~~/server/utils/pageStudio/customerPlanGrants', () => ({ requireCustomerPlanOperator: mocks.operator }))
vi.mock('~~/server/utils/pageStudio/loginSessions', () => ({ resolvePageStudioLoginSession: mocks.login, bindPageStudioLoginSession: mocks.bind }))
vi.mock('~~/server/utils/pageStudio/customerSignup', () => ({ readCustomerSession: mocks.session }))
vi.mock('~~/server/utils/pageStudio/transferControls', () => ({ callTransferControls: mocks.controls, callTransferWorkflow: mocks.workflow }))
vi.mock('~~/server/utils/pageStudio/transferRecoveryCoordinatorClient', () => ({ callTransferRecoveryInspection: mocks.inspect }))
vi.mock('~~/server/utils/rateLimit', () => ({ checkAndConsume: mocks.limit }))
const siteId = randomUUID(), requestId = randomUUID(), actorId = randomUUID()
const env = { PAGE_STUDIO_RELEASE_ENVIRONMENT: 'production', PAGE_STUDIO_CUSTOMER_SIGNUP_ENABLED: 'true', PAGE_STUDIO_CUSTOMER_ORIGIN: 'https://studio.example.test',
  PAGE_STUDIO_CUSTOMER_TERMS_VERSION: 'v1', PAGE_STUDIO_CUSTOMER_EMAIL_FROM: 'studio@example.test' }
const paths = {
  inspect: '/sites/:siteId/transfer-requests/:requestId/recovery/inspect',
  owner: '/sites/:siteId/transfer-request', list: '/transfer-requests',
  operator: '/sites/:siteId/transfer-requests/:requestId', workflow: '/sites/:siteId/transfer-requests/:requestId/workflow'
}
type Route = keyof typeof paths
async function request(route: Route, method: 'GET' | 'POST', body?: unknown, options: { cookie?: string, origin?: string, query?: string, contentType?: string, pathSite?: string, actualMethod?: string } = {}) {
  const files = {
    inspect: 'agency/page-studio/sites/[siteId]/transfer-requests/[requestId]/recovery/inspect.post',
    owner: `portal/page-studio/customer/sites/[siteId]/transfer-request.${method.toLowerCase()}`,
    list: 'agency/page-studio/transfer-requests.get',
    operator: `agency/page-studio/sites/[siteId]/transfer-requests/[requestId].${method.toLowerCase()}`,
    workflow: `agency/page-studio/sites/[siteId]/transfer-requests/[requestId]/workflow.${method.toLowerCase()}`
  }
  // Import the actual route modules, rather than routing directly to a test stub.
  const handlers = import.meta.glob('../../../server/api/**/transfer-request.*.ts')
  const operatorHandlers = import.meta.glob('../../../server/api/agency/page-studio/**/transfer-requests/**/*.ts')
  const listHandlers = import.meta.glob('../../../server/api/agency/page-studio/transfer-requests.get.ts')
  const all = { ...handlers, ...operatorHandlers, ...listHandlers }
  const loaded = await all[`../../../server/api/${files[route]}.ts`]() as { default: Parameters<ReturnType<typeof createRouter>['use']>[1] }
  const app = createApp().use((event) => {
    event.context.cloudflare = { env }
  }).use(createRouter().use(paths[route], loaded.default))
  const url = paths[route].replace(':siteId', options.pathSite ?? siteId).replace(':requestId', requestId)
  const actualMethod = options.actualMethod ?? method
  return toWebHandler(app)(new Request(`https://studio.example.test${url}${options.query ?? ''}`, { method: actualMethod,
    headers: { 'host': 'studio.example.test', 'x-forwarded-proto': 'https', 'cookie': options.cookie ?? (route === 'owner' ? `__Host-studio_customer_session=${'c'.repeat(64)}` : 'auth_token=real-cookie'),
      'origin': options.origin ?? 'https://studio.example.test', 'content-type': options.contentType ?? 'application/json' },
    ...(actualMethod === 'GET' ? {} : { body: JSON.stringify(body) }) }))
}
beforeEach(() => {
  vi.resetAllMocks()
  vi.stubGlobal('eventHandler', eventHandler)
  mocks.auth.mockResolvedValue({ id: actorId })
  mocks.login.mockResolvedValue({ userId: actorId, tokenHash: 'a'.repeat(64), role: 'agency' })
  mocks.session.mockResolvedValue({ identityId: randomUUID(), accountId: randomUUID() })
  mocks.limit.mockResolvedValue({ allowed: true })
  mocks.controls.mockResolvedValue({ siteId, requestId, revision: 5, state: 'reserved' })
  mocks.workflow.mockResolvedValue({ siteId, requestId, revision: 5, phases: [] })
})
afterEach(() => vi.unstubAllGlobals())
it.each(['request', 'approve', 'revoke'])('derives owner %s from native cookie and revalidates after RPC', async (action) => {
  const body = { action, requestId, ...(action !== 'request' ? { expectedRevision: 3 } : {}) }
  const response = await request('owner', 'POST', body)
  expect(response.status).toBe(200)
  expect(response.headers.get('cache-control')).toBe('private, no-store')
  expect(mocks.controls.mock.calls[0][0]).toEqual({ ...body, siteId, ownerLoginSessionHash: expect.stringMatching(/^[a-f0-9]{64}$/) })
  expect(mocks.session).toHaveBeenCalledTimes(2)
})
it.each(['review', 'reserve'])('uses current operator cookie for %s and checks again after RPC', async (action) => {
  expect((await request('operator', 'POST', { action, expectedRevision: 3 })).status).toBe(200)
  expect(mocks.controls.mock.calls[0][0]).toEqual({ siteId, requestId, action, expectedRevision: 3, operator: { actorId, loginSessionHash: 'a'.repeat(64) } })
  expect(mocks.auth).toHaveBeenCalledTimes(2)
  expect(mocks.operator).toHaveBeenCalledTimes(2)
  expect(mocks.bind).toHaveBeenCalledTimes(2)
})
it.each(['owner', 'operator', 'list', 'workflow'] as const)('GET %s dispatches only status/list and is no-store', async (route) => {
  const response = await request(route, 'GET', undefined, route === 'workflow' ? { query: '?expectedRevision=5' } : {})
  expect(response.status).toBe(200)
  expect(response.headers.get('cache-control')).toBe('private, no-store')
  const call = route === 'workflow' ? mocks.workflow : mocks.controls
  expect(call.mock.calls[0][0].action).toBe({ owner: 'owner-status', operator: 'operator-status', list: 'operator-list', workflow: 'status' }[route])
  expect(call).toHaveBeenCalledTimes(1)
})
it('passes only one fixed workflow action', async () => {
  expect((await request('workflow', 'POST', { phase: 'copy-admission', action: 'prepare', expectedRevision: 5 })).status).toBe(200)
  expect(mocks.workflow.mock.calls[0][0]).toEqual({ siteId, requestId, phase: 'copy-admission', action: 'prepare', expectedRevision: 5, operator: { actorId, loginSessionHash: 'a'.repeat(64) } })
  expect(mocks.controls).not.toHaveBeenCalled()
})
it.each([
  ['owner', { action: 'request', requestId, ownerLoginSessionHash: 'a'.repeat(64) }],
  ['operator', { action: 'reserve', expectedRevision: 5, operator: { actorId } }],
  ['workflow', { phase: 'copy-execution', action: 'authorize', expectedRevision: 5 }],
  ['workflow', { phase: 'source-drafts', action: 'verify', expectedRevision: 5 }],
  ['workflow', { phase: 'resources', action: 'start', expectedRevision: 5, intentDigest: 'a'.repeat(64) }]
] as const)('rejects unknown/private body fields and unsupported phase action', async (route, body) => {
  expect((await request(route, 'POST', body)).status).toBe(400)
  expect(mocks.controls).not.toHaveBeenCalled()
  expect(mocks.workflow).not.toHaveBeenCalled()
})
it.each(['owner', 'operator', 'workflow'] as const)('rejects %s wrong origin, missing cookie, oversized body and non-JSON', async (route) => {
  for (const [options, status] of [
    [{ origin: 'https://foreign.test' }, 403], [{ cookie: '' }, 401], [{ contentType: 'text/plain' }, 415]
  ] as const) expect((await request(route, 'POST', {}, options)).status).toBe(status)
  expect((await request(route, 'POST', { padding: 'x'.repeat(2048) })).status).toBe(413)
  expect(mocks.controls).not.toHaveBeenCalled()
  expect(mocks.workflow).not.toHaveBeenCalled()
})
it.each(['owner', 'operator', 'list', 'workflow'] as const)('rejects %s unknown queries and wrong methods', async (route) => {
  expect((await request(route, 'GET', undefined, { query: '?extra=1' })).status).toBe(400)
  expect((await request(route, 'GET', {}, { actualMethod: 'POST' })).status).toBe(405)
  expect(mocks.controls).not.toHaveBeenCalled()
  expect(mocks.workflow).not.toHaveBeenCalled()
})
it.each(['0', '-1', '1.1', '2147483648', '5&expectedRevision=6'])('rejects invalid revision query %s', async (revision) => {
  expect((await request('workflow', 'GET', undefined, { query: `?expectedRevision=${revision}` })).status).toBe(400)
})
it('denies unauthorized role before any Worker RPC', async () => {
  mocks.operator.mockRejectedValue({ statusCode: 403 })
  expect((await request('operator', 'POST', { action: 'review', expectedRevision: 1 })).status).toBe(403)
  expect(mocks.controls).not.toHaveBeenCalled()
})
it('withholds success after operator logout or role loss', async () => {
  mocks.operator.mockResolvedValueOnce(undefined).mockRejectedValueOnce({ statusCode: 403 })
  expect((await request('operator', 'POST', { action: 'reserve', expectedRevision: 4 })).status).toBe(403)
  expect(mocks.controls).toHaveBeenCalledTimes(1)
})
it('withholds owner response if the native session is revoked', async () => {
  mocks.session.mockResolvedValueOnce({ identityId: 'owner' }).mockRejectedValueOnce({ statusCode: 401 })
  expect((await request('owner', 'POST', { action: 'request', requestId })).status).toBe(401)
  expect(mocks.controls).toHaveBeenCalledTimes(1)
})
it('limits request before RPC and does not retry uncertain acknowledgements', async () => {
  mocks.limit.mockResolvedValueOnce({ allowed: false, resetAt: new Date(Date.now() + 10000) })
  expect((await request('operator', 'POST', { action: 'reserve', expectedRevision: 4 })).status).toBe(429)
  expect(mocks.controls).not.toHaveBeenCalled()
  mocks.controls.mockRejectedValue(createError({ statusCode: 503, statusMessage: 'private provider credentials' }))
  const response = await request('operator', 'POST', { action: 'reserve', expectedRevision: 4 })
  expect(response.status).toBe(503)
  expect(await response.text()).not.toContain('credentials')
  expect(mocks.controls).toHaveBeenCalledTimes(1)
})

const inspectBody = { action: 'inspect', expectedRevision: 5, expectedHeadVersion: 1, recoveryId: randomUUID(), captureId: randomUUID() }
it('explicit inspection POST derives the current cookie identity and rechecks it after one call', async () => {
  mocks.inspect.mockResolvedValue({ state: 'observed' })
  expect((await request('inspect', 'POST', inspectBody)).status).toBe(200)
  expect(mocks.inspect).toHaveBeenCalledExactlyOnceWith({ ...inspectBody, siteId, requestId, operator: { actorId, loginSessionHash: 'a'.repeat(64) } }, env)
  expect(mocks.operator).toHaveBeenCalledTimes(2)
})
it.each(['source', 'operator', 'operationId', 'observation'])('inspection rejects browser supplied %s', async key => {
  expect((await request('inspect', 'POST', { ...inspectBody, [key]: {} })).status).toBe(400)
  expect(mocks.inspect).not.toHaveBeenCalled()
})
it('inspection rejects GET and unknown query without private dispatch', async () => {
  expect((await request('inspect', 'POST', undefined, { actualMethod: 'GET' })).status).toBe(405)
  expect((await request('inspect', 'POST', inspectBody, { query: '?force=1' })).status).toBe(400)
  expect(mocks.inspect).not.toHaveBeenCalled()
})
it('inspection denies cross origin, missing login, rate limit and revocation', async () => {
  expect((await request('inspect', 'POST', inspectBody, { origin: 'https://foreign.test' })).status).toBe(403)
  expect((await request('inspect', 'POST', inspectBody, { cookie: '' })).status).toBe(401)
  mocks.limit.mockResolvedValueOnce({ allowed: false, resetAt: new Date(Date.now() + 1000) })
  expect((await request('inspect', 'POST', inspectBody)).status).toBe(429)
  expect(mocks.inspect).not.toHaveBeenCalled()
  mocks.operator.mockResolvedValueOnce(undefined).mockRejectedValueOnce({ statusCode: 403 })
  mocks.inspect.mockResolvedValue({ state: 'observed' })
  expect((await request('inspect', 'POST', inspectBody)).status).toBe(403)
  expect(mocks.inspect).toHaveBeenCalledOnce()
})
it('inspection does not retry a lost response', async () => {
  mocks.inspect.mockRejectedValue(Error('private lost acknowledgment'))
  const response = await request('inspect', 'POST', inspectBody)
  expect(response.status).toBe(503)
  expect(await response.text()).not.toContain('acknowledgment')
  expect(mocks.inspect).toHaveBeenCalledOnce()
})
