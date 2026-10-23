import { beforeEach, expect, it, vi } from 'vitest'
import { handleTransferRecoveryPhaseFetch } from '../../workers/page-studio-management/src/transferRecoveryPhaseFetch'
import { TRANSFER_RECOVERY_PHASE_URL } from '../../shared/pageStudio/transferRecoveryPhaseTransport'
import { collectionDigest } from '../../shared/pageStudio/collectionApi'
import input from '../fixtures/transfer-recovery-phase-enabled.json'

const mocks = vi.hoisted(() => ({ authorize: vi.fn() }))
vi.mock('~~/server/utils/pageStudio/customerTransferRecoveryPhaseAuthority', () => ({ authorizeCustomerTransferRecoveryPhase: mocks.authorize }))
const config = { PAGE_STUDIO_RELEASE_ENVIRONMENT: 'production', PAGE_STUDIO_CUSTOMER_PREVIEW_RUNTIME_ENABLED: 'true' }
const run = vi.fn()
const request = (body: unknown = input, url = TRANSFER_RECOVERY_PHASE_URL, method = 'POST') => new Request(url, {
  method, ...(method === 'POST' ? { body: JSON.stringify(body) } : {})
})
beforeEach(() => {
  vi.clearAllMocks()
  mocks.authorize.mockImplementation(async value => ({ purpose: value.purpose, envelopeDigest: await collectionDigest(value) }))
})
it('binds the fresh private acknowledgment to the complete envelope and injected transaction', async () => {
  const response = await handleTransferRecoveryPhaseFetch(request(), config, run)
  expect(response.status).toBe(200)
  expect(response.headers.get('cache-control')).toBe('no-store')
  expect(response.headers.get('x-request-digest')).toBe(await collectionDigest(input))
  expect(await response.json()).toEqual({ purpose: 'recovery-enabled', envelopeDigest: await collectionDigest(input) })
  expect(mocks.authorize).toHaveBeenCalledExactlyOnceWith(input, { env: config, runTransaction: run })
})
it('captures disabled environment before an asynchronous body read', async () => {
  const env = { ...config, PAGE_STUDIO_CUSTOMER_PREVIEW_RUNTIME_ENABLED: 'false' }
  const response = handleTransferRecoveryPhaseFetch(request(), env, run)
  env.PAGE_STUDIO_CUSTOMER_PREVIEW_RUNTIME_ENABLED = 'true'
  expect((await response).status).toBe(503)
  expect(mocks.authorize).not.toHaveBeenCalled()
})
it.each([{}, { ...config, PAGE_STUDIO_RELEASE_ENVIRONMENT: 'staging' },
  { ...config, PAGE_STUDIO_CUSTOMER_PREVIEW_RUNTIME_ENABLED: 'false' }])('rejects disabled and foreign environments', async env => {
  expect((await handleTransferRecoveryPhaseFetch(request(), env, run)).status).toBe(503)
  expect(mocks.authorize).not.toHaveBeenCalled()
})
it.each([{ ...input, proofDigest: 'c'.repeat(64) }, { ...input, purpose: 'resume' },
  { ...input, inspection: { ...input.inspection, operatorId: 'invalid' } },
  { ...input, pending: {} }])('rejects malformed or overbroad authority', async body => {
  expect((await handleTransferRecoveryPhaseFetch(request(body), config, run)).status).toBe(400)
  expect(mocks.authorize).not.toHaveBeenCalled()
})
it('bounds bodies and rejects alternate URLs and methods without dispatch', async () => {
  expect((await handleTransferRecoveryPhaseFetch(request(input, `${TRANSFER_RECOVERY_PHASE_URL}?force=1`), config, run)).status).toBe(404)
  expect((await handleTransferRecoveryPhaseFetch(request(input, undefined, 'GET'), config, run)).status).toBe(404)
  expect((await handleTransferRecoveryPhaseFetch(request(input, 'https://public.example/transfer-recovery-phase'), config, run)).status).toBe(404)
  for (const body of [' '.repeat(16385), '{', new Uint8Array([255])]) {
    expect((await handleTransferRecoveryPhaseFetch(new Request(TRANSFER_RECOVERY_PHASE_URL, { method: 'POST', body }), config, run)).status).toBe(400)
  }
  expect(mocks.authorize).not.toHaveBeenCalled()
})
it.each([400, 401, 403, 409, 503, 500])('redacts helper failure %s without retrying', async statusCode => {
  mocks.authorize.mockRejectedValueOnce({ statusCode, message: 'private token sql' })
  const response = await handleTransferRecoveryPhaseFetch(request(), config, run)
  expect(response.status).toBe(statusCode === 500 ? 503 : statusCode)
  expect(await response.text()).not.toContain('private token sql')
  expect(mocks.authorize).toHaveBeenCalledOnce()
})
it.each([{ purpose: 'observe', envelopeDigest: 'a'.repeat(64) },
  { purpose: 'recovery-enabled', envelopeDigest: 'a'.repeat(64) },
  { purpose: 'recovery-enabled', envelopeDigest: 'a'.repeat(64), grant: {} }])('rejects invalid or mismatched helper acknowledgments', async result => {
  mocks.authorize.mockResolvedValueOnce(result)
  expect((await handleTransferRecoveryPhaseFetch(request(), config, run)).status).toBe(503)
})

it.each(['MANAGED_TRANSFER_EXECUTION_POLICY', 'MANAGED_TRANSFER_RECOVERY_EXECUTION_POLICY'])('rejects %s drift during the body read before authorization', async key => {
  const env = { ...config, MANAGED_TRANSFER_EXECUTION_POLICY: 'original' }
  const response = handleTransferRecoveryPhaseFetch(request(), env, run)
  Object.assign(env, { [key]: 'different' })
  expect((await response).status).toBe(503)
  expect(mocks.authorize).not.toHaveBeenCalled()
})
it.each(['MANAGED_TRANSFER_EXECUTION_POLICY', 'MANAGED_TRANSFER_RECOVERY_EXECUTION_POLICY', 'PAGE_STUDIO_RELEASE_ENVIRONMENT', 'PAGE_STUDIO_PROVISIONING_ENVIRONMENT', 'PAGE_STUDIO_CUSTOMER_PREVIEW_RUNTIME_ENABLED'])('withholds acknowledgement when live %s changes during authorization', async key => {
  const env = { ...config, PAGE_STUDIO_PROVISIONING_ENVIRONMENT: 'production', MANAGED_TRANSFER_EXECUTION_POLICY: 'original' }
  mocks.authorize.mockImplementationOnce(async (value, options) => {
    void options
    await Promise.resolve()
    Object.assign(env, { [key]: 'changed' })
    return { purpose: value.purpose, envelopeDigest: await collectionDigest(value) }
  })
  expect((await handleTransferRecoveryPhaseFetch(request(), env, run)).status).toBe(503)
  expect(mocks.authorize.mock.calls[0][1].env).toBe(env)
  expect(mocks.authorize).toHaveBeenCalledOnce()
})
