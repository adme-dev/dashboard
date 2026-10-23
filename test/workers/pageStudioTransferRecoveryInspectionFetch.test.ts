import { beforeEach, expect, it, vi } from 'vitest'
import { handleTransferRecoveryInspectionFetch } from '../../workers/page-studio-management/src/transferRecoveryInspectionFetch'
import { TRANSFER_RECOVERY_INSPECTION_URL } from '../../shared/pageStudio/transferRecoveryInspectionTransport'
import { collectionDigest } from '../../shared/pageStudio/collectionApi'

const mocks = vi.hoisted(() => ({ authorize: vi.fn() }))
vi.mock('~~/server/utils/pageStudio/customerTransferRecoveryInspection', () => ({ authorizeCustomerTransferRecoveryInspection: mocks.authorize }))
const id = '20000000-0000-4000-8000-000000000001'
const input = { purpose: 'close', inspection: { operatorId: id, loginSessionHash: 'a'.repeat(64),
  pg: { requestId: id, requestRevision: 5, recoveryId: id, epoch: 1, version: 1, deadline: '2026-10-24T00:00:00.000Z' } },
transition: { eventId: id, previous: null, next: { operationId: id, intentDigest: 'b'.repeat(64), recoveryId: id,
  epoch: 1, version: 1, mode: 'closed', admissionId: null, appliedDigest: null, deadline: null,
  pendingDigest: null, preparedDigest: null, reconciliationDigest: null, reviewDigest: null, revision: null } } }
const config = { PAGE_STUDIO_RELEASE_ENVIRONMENT: 'production', PAGE_STUDIO_CUSTOMER_PREVIEW_RUNTIME_ENABLED: 'true' }
const run = vi.fn()
const request = (body: unknown = input, url = TRANSFER_RECOVERY_INSPECTION_URL, method = 'POST') => new Request(url, {
  method, ...(method === 'POST' ? { body: JSON.stringify(body) } : {})
})
beforeEach(() => {
  vi.clearAllMocks()
  mocks.authorize.mockImplementation(async value => ({ purpose: value.purpose, envelopeDigest: await collectionDigest(value) }))
})
it('binds the fresh private acknowledgment to the complete envelope and injected transaction', async () => {
  const response = await handleTransferRecoveryInspectionFetch(request(), config, run)
  expect(response.status).toBe(200)
  expect(response.headers.get('cache-control')).toBe('no-store')
  expect(response.headers.get('x-request-digest')).toBe(await collectionDigest(input))
  expect(await response.json()).toEqual({ purpose: 'close', envelopeDigest: await collectionDigest(input) })
  expect(mocks.authorize).toHaveBeenCalledExactlyOnceWith(input, { runTransaction: run })
})
it('passes a strict observation envelope through the same fresh private authority', async () => {
  const resourceRequest = { actor: { kind: 'agency-user', userId: id, loginSessionHash: 'a'.repeat(64) },
    anchor: { checkpointId: 'checkpoint_1', digest: 'b'.repeat(64) }, mode: 'attach-existing-content', operationId: id,
    policyVersion: 'policy-v1', runtimeDigest: 'c'.repeat(64), schemaDigest: 'd'.repeat(64), version: 1,
    scope: { businessId: id, clientId: id, environment: 'production', siteId: id, tenantId: id } }
  const reference = { operationId: id, intentDigest: 'b'.repeat(64), resourceRequest }
  const observation = { purpose: 'observe', inspection: input.inspection, request: reference,
    requestDigest: await collectionDigest(reference), recovery: { operationId: id, intentDigest: 'b'.repeat(64),
      recoveryId: id, epoch: 1, version: 1, mode: 'closed' } }
  const response = await handleTransferRecoveryInspectionFetch(request(observation), config, run)
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ purpose: 'observe', envelopeDigest: await collectionDigest(observation) })
  expect(mocks.authorize).toHaveBeenCalledExactlyOnceWith(observation, { runTransaction: run })
})
it('captures disabled environment before an asynchronous body read', async () => {
  const env = { ...config, PAGE_STUDIO_CUSTOMER_PREVIEW_RUNTIME_ENABLED: 'false' }
  const response = handleTransferRecoveryInspectionFetch(request(), env, run)
  env.PAGE_STUDIO_CUSTOMER_PREVIEW_RUNTIME_ENABLED = 'true'
  expect((await response).status).toBe(503)
  expect(mocks.authorize).not.toHaveBeenCalled()
})
it.each([{}, { ...config, PAGE_STUDIO_RELEASE_ENVIRONMENT: 'staging' },
  { ...config, PAGE_STUDIO_CUSTOMER_PREVIEW_RUNTIME_ENABLED: 'false' }])('rejects disabled and foreign environments', async env => {
  expect((await handleTransferRecoveryInspectionFetch(request(), env, run)).status).toBe(503)
  expect(mocks.authorize).not.toHaveBeenCalled()
})
it.each([{ ...input, proofDigest: 'c'.repeat(64) }, { ...input, purpose: 'resume' },
  { ...input, inspection: { ...input.inspection, operatorId: 'invalid' } },
  { ...input, transition: { ...input.transition, previous: {} } }])('rejects malformed or overbroad authority', async body => {
  expect((await handleTransferRecoveryInspectionFetch(request(body), config, run)).status).toBe(400)
  expect(mocks.authorize).not.toHaveBeenCalled()
})
it('bounds bodies and rejects alternate URLs and methods without dispatch', async () => {
  expect((await handleTransferRecoveryInspectionFetch(request(input, `${TRANSFER_RECOVERY_INSPECTION_URL}?force=1`), config, run)).status).toBe(404)
  expect((await handleTransferRecoveryInspectionFetch(request(input, undefined, 'GET'), config, run)).status).toBe(404)
  expect((await handleTransferRecoveryInspectionFetch(request(input, 'https://public.example/transfer-recovery-inspection'), config, run)).status).toBe(404)
  for (const body of [' '.repeat(16385), '{', new Uint8Array([255])]) {
    expect((await handleTransferRecoveryInspectionFetch(new Request(TRANSFER_RECOVERY_INSPECTION_URL, { method: 'POST', body }), config, run)).status).toBe(400)
  }
  expect(mocks.authorize).not.toHaveBeenCalled()
})
it.each([400, 401, 403, 409, 503, 500])('redacts helper failure %s without retrying', async statusCode => {
  mocks.authorize.mockRejectedValueOnce({ statusCode, message: 'private token sql' })
  const response = await handleTransferRecoveryInspectionFetch(request(), config, run)
  expect(response.status).toBe(statusCode === 500 ? 503 : statusCode)
  expect(await response.text()).not.toContain('private token sql')
  expect(mocks.authorize).toHaveBeenCalledOnce()
})
it.each([{ purpose: 'observe', envelopeDigest: 'a'.repeat(64) },
  { purpose: 'close', envelopeDigest: 'a'.repeat(64) },
  { purpose: 'close', envelopeDigest: 'a'.repeat(64), grant: {} }])('rejects invalid or mismatched helper acknowledgments', async result => {
  mocks.authorize.mockResolvedValueOnce(result)
  expect((await handleTransferRecoveryInspectionFetch(request(), config, run)).status).toBe(503)
})
