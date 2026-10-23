import { beforeEach, expect, it, vi } from 'vitest'
import { handleTransferRecoveryAdmissionFetch } from '../../workers/page-studio-management/src/transferRecoveryAdmissionFetch'
import { TRANSFER_RECOVERY_ADMISSION_URL } from '../../shared/pageStudio/transferRecoveryAdmissionTransport'
import { collectionDigest } from '../../shared/pageStudio/collectionApi'
import input from '../fixtures/transfer-recovery-admission.json'

const mocks = vi.hoisted(() => ({ authorize: vi.fn() }))
vi.mock('~~/server/utils/pageStudio/customerTransferRecoveryAdmissionAuthority', () => ({ authorizeCustomerTransferRecoveryAdmission: mocks.authorize }))
const config = { PAGE_STUDIO_RELEASE_ENVIRONMENT: 'production', PAGE_STUDIO_CUSTOMER_PREVIEW_RUNTIME_ENABLED: 'true' }
const run = vi.fn()
const request = (body: unknown = input, url = TRANSFER_RECOVERY_ADMISSION_URL, method = 'POST') => new Request(url, {
  method, ...(method === 'POST' ? { body: JSON.stringify(body) } : {})
})
beforeEach(() => {
  vi.clearAllMocks()
  mocks.authorize.mockImplementation(async value => ({ purpose: value.purpose, envelopeDigest: await collectionDigest(value) }))
})
it('binds the fresh private acknowledgment to the complete envelope and injected transaction', async () => {
  const response = await handleTransferRecoveryAdmissionFetch(request(), config, run)
  expect(response.status).toBe(200)
  expect(response.headers.get('cache-control')).toBe('no-store')
  expect(response.headers.get('x-request-digest')).toBe(await collectionDigest(input))
  expect(await response.json()).toEqual({ purpose: 'admission-pending', envelopeDigest: await collectionDigest(input) })
  expect(mocks.authorize).toHaveBeenCalledExactlyOnceWith(input, { runTransaction: run })
})
it('captures disabled environment before an asynchronous body read', async () => {
  const env = { ...config, PAGE_STUDIO_CUSTOMER_PREVIEW_RUNTIME_ENABLED: 'false' }
  const response = handleTransferRecoveryAdmissionFetch(request(), env, run)
  env.PAGE_STUDIO_CUSTOMER_PREVIEW_RUNTIME_ENABLED = 'true'
  expect((await response).status).toBe(503)
  expect(mocks.authorize).not.toHaveBeenCalled()
})
it.each([{}, { ...config, PAGE_STUDIO_RELEASE_ENVIRONMENT: 'staging' },
  { ...config, PAGE_STUDIO_CUSTOMER_PREVIEW_RUNTIME_ENABLED: 'false' }])('rejects disabled and foreign environments', async env => {
  expect((await handleTransferRecoveryAdmissionFetch(request(), env, run)).status).toBe(503)
  expect(mocks.authorize).not.toHaveBeenCalled()
})
it.each([{ ...input, proofDigest: 'c'.repeat(64) }, { ...input, purpose: 'resume' },
  { ...input, inspection: { ...input.inspection, operatorId: 'invalid' } },
  { ...input, pending: {} }])('rejects malformed or overbroad authority', async body => {
  expect((await handleTransferRecoveryAdmissionFetch(request(body), config, run)).status).toBe(400)
  expect(mocks.authorize).not.toHaveBeenCalled()
})
it('bounds bodies and rejects alternate URLs and methods without dispatch', async () => {
  expect((await handleTransferRecoveryAdmissionFetch(request(input, `${TRANSFER_RECOVERY_ADMISSION_URL}?force=1`), config, run)).status).toBe(404)
  expect((await handleTransferRecoveryAdmissionFetch(request(input, undefined, 'GET'), config, run)).status).toBe(404)
  expect((await handleTransferRecoveryAdmissionFetch(request(input, 'https://public.example/transfer-recovery-admission'), config, run)).status).toBe(404)
  for (const body of [' '.repeat(16385), '{', new Uint8Array([255])]) {
    expect((await handleTransferRecoveryAdmissionFetch(new Request(TRANSFER_RECOVERY_ADMISSION_URL, { method: 'POST', body }), config, run)).status).toBe(400)
  }
  expect(mocks.authorize).not.toHaveBeenCalled()
})
it.each([400, 401, 403, 409, 503, 500])('redacts helper failure %s without retrying', async statusCode => {
  mocks.authorize.mockRejectedValueOnce({ statusCode, message: 'private token sql' })
  const response = await handleTransferRecoveryAdmissionFetch(request(), config, run)
  expect(response.status).toBe(statusCode === 500 ? 503 : statusCode)
  expect(await response.text()).not.toContain('private token sql')
  expect(mocks.authorize).toHaveBeenCalledOnce()
})
it.each([{ purpose: 'observe', envelopeDigest: 'a'.repeat(64) },
  { purpose: 'admission-pending', envelopeDigest: 'a'.repeat(64) },
  { purpose: 'admission-pending', envelopeDigest: 'a'.repeat(64), grant: {} }])('rejects invalid or mismatched helper acknowledgments', async result => {
  mocks.authorize.mockResolvedValueOnce(result)
  expect((await handleTransferRecoveryAdmissionFetch(request(), config, run)).status).toBe(503)
})
