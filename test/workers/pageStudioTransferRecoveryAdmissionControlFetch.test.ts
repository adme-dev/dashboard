import { beforeEach, expect, it, vi } from 'vitest'
import { collectionDigest } from '../../shared/pageStudio/collectionApi'
import { RECOVERY_ADMISSION_CONTROL_URL as URL, RECOVERY_ADMISSION_CONTROL_UNAVAILABLE as UNAVAILABLE } from '../../shared/pageStudio/transferRecoveryAdmissionControlTransport'
import { handleTransferRecoveryAdmissionControlFetch } from '../../workers/page-studio-management/src/transferRecoveryAdmissionControlFetch'
import { callTransferRecoveryAdmissionControl } from '../../server/utils/pageStudio/transferRecoveryAdmissionControlClient'
const mocks = vi.hoisted(() => ({ control: vi.fn() }))
vi.mock('~~/server/utils/pageStudio/customerTransferRecoveryAdmissionControl', () => ({ controlCustomerTransferRecoveryAdmission: mocks.control }))
const id = (n: number) => `20000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const config = { PAGE_STUDIO_RELEASE_ENVIRONMENT: 'production', PAGE_STUDIO_CUSTOMER_PREVIEW_RUNTIME_ENABLED: 'true', PAGE_STUDIO_PROVISIONING_ENVIRONMENT: 'production' }
const scope = { siteId: id(1), requestId: id(2), expectedRevision: 5 }
const operator = { actorId: id(3), loginSessionHash: 'a'.repeat(64) }
const review = { reviewId: id(4), revision: 1, reviewDigest: 'b'.repeat(64) }
const admissionId = id(5), deadline = '2099-10-24T00:00:00.000Z'
const actions = [{ action: 'read' }, { action: 'begin', admissionId, review, expectedHeadVersion: 2, prepareEventId: id(6), enableEventId: id(7) },
  { action: 'prepare', admissionId, expectedHeadVersion: 3 }, { action: 'apply', admissionId, expectedHeadVersion: 3 }, { action: 'enable', admissionId, expectedHeadVersion: 4 }]
const input = (request = actions[0]) => ({ ...scope, operator, request, expectedEnvironment: 'production' })
const view = (action: string) => ({ ...scope, action, admissionId: action === 'read' ? null : admissionId, review, deadline,
  pgState: action === 'read' ? 'approved' : ['apply', 'enable'].includes(action) ? 'applied' : 'pending',
  d1State: action === 'prepare' ? 'prepared' : action === 'enable' ? 'enabled' : 'unverified' })
const run = vi.fn()
const request = (body: unknown = input()) => new Request(URL, { method: 'POST', body: JSON.stringify(body) })
const transport = (env: Record<string, unknown> = config) => {
  const fetch = vi.fn(req => handleTransferRecoveryAdmissionControlFetch(req, env, run))
  return { fetch, env: { ...env, PAGE_STUDIO_MANAGEMENT: { fetch } } }
}
beforeEach(() => { vi.clearAllMocks(); mocks.control.mockImplementation(async value => view(value.request.action)) })
it.each(actions)('carries explicit $action through one exact private call and strips transport metadata', async action => {
  const { fetch, env } = transport()
  expect(await callTransferRecoveryAdmissionControl(input(action), env)).toEqual(view(action.action))
  expect(mocks.control).toHaveBeenCalledExactlyOnceWith({ ...scope, operator, request: action }, { env: config, runTransaction: run })
  expect(mocks.control.mock.calls[0][1].env).toBe(config)
  expect(fetch).toHaveBeenCalledOnce()
  expect(fetch.mock.calls[0][0].url).toBe(URL)
})
it.each(['operationId', 'pending', 'applied', 'proof', 'ownerToken'])('rejects injected action authority %s', async field => {
  expect((await handleTransferRecoveryAdmissionControlFetch(request(input({ ...actions[0], [field]: 'foreign' })), config, run)).status).toBe(400)
  expect(mocks.control).not.toHaveBeenCalled()
})
it('rejects methods, alternate hosts, queries, malformed, oversized and unsupported requests', async () => {
  for (const req of [new Request(URL), new Request(`${URL}?force=1`, { method: 'POST' }), new Request('https://public.example/transfer-recovery-admission-control', { method: 'POST' })]) expect((await handleTransferRecoveryAdmissionControlFetch(req, config, run)).status).toBe(404)
  for (const body of [' '.repeat(16385), '{', new Uint8Array([255])]) expect((await handleTransferRecoveryAdmissionControlFetch(new Request(URL, { method: 'POST', body }), config, run)).status).toBe(400)
  for (const env of [{}, { ...config, PAGE_STUDIO_RELEASE_ENVIRONMENT: 'staging' }]) expect((await handleTransferRecoveryAdmissionControlFetch(request(), env, run)).status).toBe(503)
  expect(mocks.control).not.toHaveBeenCalled()
})
it.each(['siteId', 'requestId', 'expectedRevision', 'action', 'admissionId', 'review'])('rejects substituted %s acknowledgements', async field => {
  const wrong = { ...view('begin'), [field]: field === 'expectedRevision' ? 6 : field === 'action' ? 'read' : field === 'review' ? { ...review, reviewDigest: 'f'.repeat(64) } : id(99) }
  mocks.control.mockResolvedValueOnce(wrong)
  await expect(callTransferRecoveryAdmissionControl(input(actions[1]), transport().env)).rejects.toMatchObject({ statusCode: 503 })
})
it.each(['PAGE_STUDIO_RELEASE_ENVIRONMENT', 'PAGE_STUDIO_CUSTOMER_PREVIEW_RUNTIME_ENABLED', 'PAGE_STUDIO_PROVISIONING_ENVIRONMENT', 'PAGE_STUDIO_PROVISIONER'])('rejects %s drift before and during the private operation', async key => {
  const env = { ...config } as Record<string, unknown>
  const result = handleTransferRecoveryAdmissionControlFetch(request(), env, run)
  env[key] = 'changed'
  expect((await result).status).toBe(503); expect(mocks.control).not.toHaveBeenCalled()
  const current = { ...config } as Record<string, unknown>
  mocks.control.mockImplementationOnce(async () => { current[key] = 'changed'; return view('read') })
  await expect(callTransferRecoveryAdmissionControl(input(), transport(current).env)).rejects.toMatchObject({ statusCode: 503 })
  expect(mocks.control.mock.calls[0][1].env).toBe(current)
  expect(mocks.control).toHaveBeenCalledOnce()
})
it('redacts permission failures and never retries uncertain mutation results', async () => {
  mocks.control.mockRejectedValueOnce({ statusCode: 403, message: 'private credentials' })
  await expect(callTransferRecoveryAdmissionControl(input(actions[1]), transport().env)).rejects.toMatchObject({ statusCode: 403, statusMessage: UNAVAILABLE })
  const fetch = vi.fn().mockRejectedValue(Error('private credentials'))
  await expect(callTransferRecoveryAdmissionControl(input(actions[1]), { ...config, PAGE_STUDIO_MANAGEMENT: { fetch } })).rejects.toMatchObject({ statusCode: 503, statusMessage: UNAVAILABLE })
  expect(fetch).toHaveBeenCalledOnce()
})
it('rejects response digest replacement and redirects', async () => {
  const value = input(), digest = await collectionDigest(value)
  for (const response of [Response.json({ ok: true, requestDigest: digest, value: view('read') }, { headers: { 'x-request-digest': 'f'.repeat(64) } }),
    Response.json({ ok: true, requestDigest: 'f'.repeat(64), value: view('read') }, { headers: { 'x-request-digest': digest } }),
    new Response(null, { status: 302, headers: { location: 'https://foreign.test', 'x-request-digest': digest } })]) {
    const fetch = vi.fn().mockResolvedValue(response)
    await expect(callTransferRecoveryAdmissionControl(value, { ...config, PAGE_STUDIO_MANAGEMENT: { fetch } })).rejects.toMatchObject({ statusCode: 503 })
    expect(fetch).toHaveBeenCalledOnce()
  }
})
