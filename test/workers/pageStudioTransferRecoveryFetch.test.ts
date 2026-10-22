import { beforeEach, expect, it, vi } from 'vitest'
import { handleTransferRecoveryFetch } from '../../workers/page-studio-management/src/transferRecoveryFetch'
import { callTransferRecovery } from '../../server/utils/pageStudio/transferRecoveryClient'
import { TRANSFER_RECOVERY_URL, TRANSFER_RECOVERY_UNAVAILABLE } from '../../shared/pageStudio/transferRecoveryTransport'
import { collectionDigest } from '../../shared/pageStudio/collectionApi'

const mocks = vi.hoisted(() => ({ read: vi.fn(), change: vi.fn() }))
vi.mock('~~/server/utils/pageStudio/customerTransferRecovery', () => ({ readCustomerTransferRecovery: mocks.read, changeCustomerTransferRecovery: mocks.change }))
const siteId = '20000000-0000-4000-8000-000000000001', requestId = '20000000-0000-4000-8000-000000000002'
const recoveryId = '20000000-0000-4000-8000-000000000004'
const operator = { actorId: '20000000-0000-4000-8000-000000000003', loginSessionHash: 'a'.repeat(64) }
const input = { siteId, requestId, operator, expectedEnvironment: 'production', action: 'status', expectedRevision: 5 }
const config = { PAGE_STUDIO_RELEASE_ENVIRONMENT: 'production', PAGE_STUDIO_CUSTOMER_PREVIEW_RUNTIME_ENABLED: 'true' }
const view = { siteId, requestId, revision: 5, recovery: null, allowedActions: ['open'] }
const run = vi.fn()
const request = (value: unknown = input, url = TRANSFER_RECOVERY_URL, method = 'POST') => new Request(url, {
  method, ...(method === 'POST' ? { body: JSON.stringify(value), headers: { 'content-type': 'application/json' } } : {})
})
beforeEach(() => {
  vi.clearAllMocks()
  mocks.read.mockResolvedValue(view)
  mocks.change.mockResolvedValue(view)
})

it('round-trips status through the actual private client/receiver and injected fresh transaction runner', async () => {
  const fetch = vi.fn(req => handleTransferRecoveryFetch(req, config, run))
  expect(await callTransferRecovery(input, { ...config, PAGE_STUDIO_MANAGEMENT: { fetch } })).toEqual(view)
  expect(mocks.read).toHaveBeenCalledExactlyOnceWith({ siteId, requestId, operator, query: { expectedRevision: 5 } }, { runTransaction: run })
  expect(mocks.change).not.toHaveBeenCalled()
  expect(fetch).toHaveBeenCalledOnce()
  expect(fetch.mock.calls[0]![0].url).toBe(TRANSFER_RECOVERY_URL)
})
it.each(['open', 'revoke'])('passes only the parsed %s body to the private helper', async action => {
  const deadline = '2026-10-24T00:00:00.000Z'
  const body = { action, expectedRevision: 5, recoveryId, expectedHeadVersion: action === 'open' ? null : 1,
    ...(action === 'open' ? { deadline } : {}) }
  const result = { ...view, recovery: { recoveryId, epoch: 1, version: action === 'open' ? 1 : 2,
    state: action === 'open' ? 'reconciling' : 'revoked', deadline, expired: false }, allowedActions: [] }
  mocks.change.mockResolvedValueOnce(result)
  expect(await callTransferRecovery({ ...input, ...body }, { ...config,
    PAGE_STUDIO_MANAGEMENT: { fetch: req => handleTransferRecoveryFetch(req, config, run) } })).toEqual(result)
  expect(mocks.change).toHaveBeenCalledExactlyOnceWith({ siteId, requestId, operator, body }, { runTransaction: run })
})
it.each([{}, { ...config, PAGE_STUDIO_RELEASE_ENVIRONMENT: 'staging' }, { ...config, PAGE_STUDIO_CUSTOMER_PREVIEW_RUNTIME_ENABLED: 'false' }])('rejects disabled or foreign receiver configuration', async env => {
  expect((await handleTransferRecoveryFetch(request(), env, run)).status).toBe(503)
  expect(mocks.read).not.toHaveBeenCalled()
})
it.each([{ ...input, proof: {} }, { ...input, expectedEnvironment: 'staging' }, { ...input, expectedRevision: 0 }, { ...input, action: 'resume' }])('rejects extra authority and unsupported requests', async body => {
  expect((await handleTransferRecoveryFetch(request(body), config, run)).status).toBe(400)
  expect(mocks.read).not.toHaveBeenCalled()
  expect(mocks.change).not.toHaveBeenCalled()
})
it('bounds and redacts transport failures without dispatch', async () => {
  expect((await handleTransferRecoveryFetch(request(input, `${TRANSFER_RECOVERY_URL}?force=1`), config, run)).status).toBe(404)
  expect((await handleTransferRecoveryFetch(request(input, undefined, 'GET'), config, run)).status).toBe(404)
  for (const body of [' '.repeat(16385), new Uint8Array([255]), '{']) {
    expect((await handleTransferRecoveryFetch(new Request(TRANSFER_RECOVERY_URL, { method: 'POST', body }), config, run)).status).toBe(400)
  }
  expect(mocks.read).not.toHaveBeenCalled()
})
it.each([403, 409, 503])('retains bounded failure status %s but redacts helper details and never retries', async statusCode => {
  mocks.read.mockRejectedValueOnce({ statusCode, message: 'private sql and token' })
  const fetch = vi.fn(req => handleTransferRecoveryFetch(req, config, run))
  await expect(callTransferRecovery(input, { ...config, PAGE_STUDIO_MANAGEMENT: { fetch } })).rejects.toMatchObject({ statusCode, statusMessage: TRANSFER_RECOVERY_UNAVAILABLE })
  expect(fetch).toHaveBeenCalledOnce()
  expect(mocks.read).toHaveBeenCalledOnce()
})
it.each([{ ...view, siteId: recoveryId }, { ...view, revision: 6 }, { ...view, secret: 'private' }])('denies wrong or overbroad response projections', async value => {
  mocks.read.mockResolvedValueOnce(value)
  await expect(callTransferRecovery(input, { ...config,
    PAGE_STUDIO_MANAGEMENT: { fetch: req => handleTransferRecoveryFetch(req, config, run) } })).rejects.toMatchObject({ statusCode: 503 })
})
it('rejects mismatched digest and lost acknowledgement without retries', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(Response.json({ ok: true, requestDigest: await collectionDigest(input), value: view },
    { headers: { 'x-request-digest': 'b'.repeat(64) } })).mockRejectedValueOnce(new Error('lost private acknowledgement'))
  for (let i = 0; i < 2; i++) await expect(callTransferRecovery(input, { ...config, PAGE_STUDIO_MANAGEMENT: { fetch } })).rejects.toMatchObject({ statusCode: 503 })
  expect(fetch).toHaveBeenCalledTimes(2)
})

it.each([{ recoveryId: requestId }, { version: 2 }, { epoch: 2 }, { deadline: '2026-10-25T00:00:00.000Z' }])(
  'rejects a valid but different open-review response: %j', async change => {
    const deadline = '2026-10-24T00:00:00.000Z'
    const body = { ...input, action: 'open', recoveryId, deadline, expectedHeadVersion: null }
    mocks.change.mockResolvedValueOnce({ ...view, allowedActions: [], recovery: {
      recoveryId, epoch: 1, version: 1, state: 'reconciling', deadline, expired: false, ...change
    } })
    await expect(callTransferRecovery(body, { ...config,
      PAGE_STUDIO_MANAGEMENT: { fetch: req => handleTransferRecoveryFetch(req, config, run) } })).rejects.toMatchObject({ statusCode: 503 })
    expect(mocks.change).toHaveBeenCalledOnce()
  })

it('returns the exact historical open result after revocation without reopening or retrying', async () => {
  const deadline = '2026-10-24T00:00:00.000Z'
  const body = { ...input, action: 'open', recoveryId, deadline, expectedHeadVersion: null }
  const result = { ...view, allowedActions: [], recovery: {
    recoveryId, epoch: 1, version: 2, state: 'revoked', deadline, expired: true
  } }
  mocks.change.mockResolvedValueOnce(result)
  expect(await callTransferRecovery(body, { ...config,
    PAGE_STUDIO_MANAGEMENT: { fetch: req => handleTransferRecoveryFetch(req, config, run) } })).toEqual(result)
  expect(mocks.change).toHaveBeenCalledOnce()
})
