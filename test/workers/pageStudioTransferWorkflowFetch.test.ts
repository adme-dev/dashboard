import { beforeEach, expect, it, vi } from 'vitest'
import { handleTransferWorkflowFetch } from '../../workers/page-studio-management/src/transferWorkflowFetch'
import { collectionDigest } from '../../shared/pageStudio/collectionApi'

const mocks = vi.hoisted(() => ({ handle: vi.fn() }))
vi.mock('~~/workers/page-studio-management/src/transferWorkflow', () => ({ handleTransferWorkflow: mocks.handle }))
const input = { siteId: '10000000-0000-4000-8000-000000000001', requestId: '10000000-0000-4000-8000-000000000002', expectedRevision: 5, operator: { actorId: '10000000-0000-4000-8000-000000000003', loginSessionHash: 'a'.repeat(64) }, expectedEnvironment: 'production', action: 'status' }
const config = { PAGE_STUDIO_RELEASE_ENVIRONMENT: 'production', PAGE_STUDIO_CUSTOMER_PREVIEW_RUNTIME_ENABLED: 'true' }
const run = vi.fn()
const request = (body: unknown = input, url = 'https://page-studio-management.internal/transfer-workflow', method = 'POST') => new Request(url, { method, ...(method === 'POST' ? { body: JSON.stringify(body) } : {}) })
beforeEach(() => {
  vi.clearAllMocks()
  mocks.handle.mockImplementation(async value => ({ ok: false, requestDigest: await collectionDigest(value), error: { statusCode: 409, message: 'Original request changed' } }))
})
it('delegates unchanged coordinator and fresh runner on every invocation preserving business envelope', async () => {
  for (let i = 0; i < 2; i++) {
    const response = await handleTransferWorkflowFetch(request(), config, run)
    expect(response.status).toBe(200)
    expect(response.headers.get('x-request-digest')).toBe(await collectionDigest(input))
    expect(await response.json()).toEqual({ ok: false, requestDigest: await collectionDigest(input), error: { statusCode: 409, message: 'Original request changed' } })
  }
  expect(mocks.handle).toHaveBeenCalledTimes(2)
  expect(mocks.handle).toHaveBeenCalledWith(input, config, run)
  expect(run).not.toHaveBeenCalled()
})
it.each([{}, { ...config, PAGE_STUDIO_RELEASE_ENVIRONMENT: 'staging' }, { ...config, PAGE_STUDIO_CUSTOMER_PREVIEW_RUNTIME_ENABLED: 'false' }])('rejects invalid receiver configuration', async (env) => {
  expect((await handleTransferWorkflowFetch(request(), env, run)).status).toBe(503)
  expect(mocks.handle).not.toHaveBeenCalled()
})
it.each([{ ...input, arbitraryMethod: 'resources' }, { ...input, expectedEnvironment: 'staging' }, { ...input, expectedRevision: 0 }])('strictly rejects malformed requests', async (body) => {
  const response = await handleTransferWorkflowFetch(request(body), config, run)
  expect(response.status).toBe(400)
  expect(response.headers.get('x-request-digest')).toBe(await collectionDigest(body))
  expect(mocks.handle).not.toHaveBeenCalled()
})
it('rejects wrong path/method, oversized and invalid utf8 without coordinator calls', async () => {
  expect((await handleTransferWorkflowFetch(request(input, 'https://public.invalid/'), config, run)).status).toBe(404)
  expect((await handleTransferWorkflowFetch(request(input, undefined, 'GET'), config, run)).status).toBe(404)
  for (const body of [' '.repeat(16385), new Uint8Array([255])]) expect((await handleTransferWorkflowFetch(new Request('https://page-studio-management.internal/transfer-workflow', { method: 'POST', body }), config, run)).status).toBe(400)
  expect(mocks.handle).not.toHaveBeenCalled()
})
it('redacts thrown failures without retry', async () => {
  mocks.handle.mockRejectedValueOnce(new Error('private-secret'))
  const response = await handleTransferWorkflowFetch(request(), config, run)
  expect(response.status).toBe(503)
  expect(await response.text()).not.toContain('private-secret')
  expect(mocks.handle).toHaveBeenCalledOnce()
})
