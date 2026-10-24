import { beforeEach, expect, it, vi } from 'vitest'
import { handleTransferRecoveryCoordinatorFetch } from '../../workers/page-studio-management/src/transferRecoveryCoordinatorFetch'
import { callTransferRecoveryInspection } from '../../server/utils/pageStudio/transferRecoveryCoordinatorClient'
import { TRANSFER_RECOVERY_COORDINATOR_URL as URL, TRANSFER_RECOVERY_COORDINATOR_UNAVAILABLE as UNAVAILABLE } from '../../shared/pageStudio/transferRecoveryCoordinatorTransport'
import { collectionDigest } from '../../shared/pageStudio/collectionApi'
const mocks = vi.hoisted(() => ({ inspect: vi.fn() }))
vi.mock('~~/server/utils/pageStudio/customerTransferRecoveryCoordinator', () => ({ inspectCustomerTransferRecovery: mocks.inspect }))
const id = (n: number) => `20000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const input = { siteId: id(1), requestId: id(2), operator: { actorId: id(3), loginSessionHash: 'a'.repeat(64) },
  action: 'inspect', expectedRevision: 5, expectedHeadVersion: 1, recoveryId: id(4), captureId: id(5), expectedEnvironment: 'production' }
const config = { PAGE_STUDIO_RELEASE_ENVIRONMENT: 'production', PAGE_STUDIO_CUSTOMER_PREVIEW_RUNTIME_ENABLED: 'true' }
const view = { siteId: id(1), requestId: id(2), revision: 5, recoveryId: id(4), captureId: id(5), state: 'observed', historical: false,
  digest: 'b'.repeat(64), observedStartedAt: '2026-10-23T00:00:00.000Z', observedCompletedAt: '2026-10-23T00:00:01.000Z' }
const run = vi.fn()
const request = (body: unknown = input) => new Request(URL, { method: 'POST', body: JSON.stringify(body) })
const transport = () => { const fetch = vi.fn(req => handleTransferRecoveryCoordinatorFetch(req, config, run)); return { fetch, env: { ...config, PAGE_STUDIO_MANAGEMENT: { fetch } } } }
beforeEach(() => { vi.clearAllMocks(); mocks.inspect.mockResolvedValue(view) })
it('round trips one explicit inspection with only server identity and scoped action', async () => {
  const { fetch, env } = transport()
  expect(await callTransferRecoveryInspection(input, env)).toEqual(view)
  const { siteId, requestId, operator, expectedEnvironment: _, ...body } = input
  expect(mocks.inspect).toHaveBeenCalledExactlyOnceWith({ siteId, requestId, operator, body }, { env: config, runTransaction: run })
  expect(fetch).toHaveBeenCalledOnce()
  expect(fetch.mock.calls[0]![0].url).toBe(URL)
})
it.each(['operationId', 'source', 'proof', 'deadline', 'observation'])('denies browser supplied %s', async key => {
  expect((await handleTransferRecoveryCoordinatorFetch(request({ ...input, [key]: {} }), config, run)).status).toBe(400)
  expect(mocks.inspect).not.toHaveBeenCalled()
})
it.each([{ ...input, expectedHeadVersion: 2 }, { ...input, action: 'resume' }, { ...input, expectedEnvironment: 'staging' }])('denies unsupported authority', async body => {
  expect((await handleTransferRecoveryCoordinatorFetch(request(body), config, run)).status).toBe(400)
  expect(mocks.inspect).not.toHaveBeenCalled()
})
it.each([{}, { ...config, PAGE_STUDIO_RELEASE_ENVIRONMENT: 'staging' }, { ...config, PAGE_STUDIO_CUSTOMER_PREVIEW_RUNTIME_ENABLED: 'false' }])('denies disabled config', async env => {
  expect((await handleTransferRecoveryCoordinatorFetch(request(), env, run)).status).toBe(503)
  expect(mocks.inspect).not.toHaveBeenCalled()
})
it('denies GET, foreign path, oversized body and malformed UTF8 without dispatch', async () => {
  for (const req of [new Request(URL), new Request(`${URL}?force=1`, { method: 'POST' })]) expect((await handleTransferRecoveryCoordinatorFetch(req, config, run)).status).toBe(404)
  for (const body of [' '.repeat(16385), '{', new Uint8Array([255])]) expect((await handleTransferRecoveryCoordinatorFetch(new Request(URL, { method: 'POST', body }), config, run)).status).toBe(400)
  expect(mocks.inspect).not.toHaveBeenCalled()
})
it.each(['siteId', 'requestId', 'recoveryId', 'captureId', 'revision'])('rejects mismatched %s in receipt', async key => {
  mocks.inspect.mockResolvedValue({ ...view, [key]: key === 'revision' ? 6 : id(99) })
  const { env } = transport()
  await expect(callTransferRecoveryInspection(input, env)).rejects.toMatchObject({ statusCode: 503 })
})
it('rejects private projection and redacts uncertain errors without retry', async () => {
  mocks.inspect.mockResolvedValueOnce({ ...view, source: 'private' }).mockRejectedValueOnce({ statusCode: 409, message: 'private credentials' })
  const { env, fetch } = transport()
  await expect(callTransferRecoveryInspection(input, env)).rejects.toMatchObject({ statusCode: 503 })
  await expect(callTransferRecoveryInspection(input, env)).rejects.toMatchObject({ statusCode: 409, statusMessage: UNAVAILABLE })
  expect(fetch).toHaveBeenCalledTimes(2)
})
it('rejects mismatched digest and lost acknowledgement without retry', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(Response.json({ ok: true, requestDigest: await collectionDigest(input), value: view }, { headers: { 'x-request-digest': 'c'.repeat(64) } })).mockRejectedValueOnce(Error('lost acknowledgement'))
  for (let i = 0; i < 2; i++) await expect(callTransferRecoveryInspection(input, { ...config, PAGE_STUDIO_MANAGEMENT: { fetch } })).rejects.toMatchObject({ statusCode: 503 })
  expect(fetch).toHaveBeenCalledTimes(2)
})
