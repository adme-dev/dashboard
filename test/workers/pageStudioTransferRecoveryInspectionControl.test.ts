import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import control from '../../workers/page-studio-control/src/index'
import { handleTransferRecoveryInspectionFetch } from '../../workers/page-studio-management/src/transferRecoveryInspectionFetch'
import { collectionDigest } from '../../shared/pageStudio/collectionApi'
const mocks = vi.hoisted(() => ({ authorize: vi.fn() }))
vi.mock('~~/server/utils/pageStudio/customerTransferRecoveryInspection', () => ({ authorizeCustomerTransferRecoveryInspection: mocks.authorize }))
const path = '/internal/page-studio/managed-transfers/recovery/inspect'
const id = '20000000-0000-4000-8000-000000000001'
const input = { purpose: 'close', inspection: { operatorId: id, loginSessionHash: 'a'.repeat(64), pg: {
  requestId: id, requestRevision: 5, recoveryId: id, epoch: 1, version: 1, deadline: '2026-10-24T00:00:00.000Z' } },
transition: { eventId: id, previous: null, next: { operationId: id, intentDigest: 'b'.repeat(64), recoveryId: id,
  epoch: 1, version: 1, mode: 'closed', admissionId: null, appliedDigest: null, deadline: null,
  pendingDigest: null, preparedDigest: null, reconciliationDigest: null, reviewDigest: null, revision: null } } }
const run = vi.fn(), upstream = vi.fn()
const receiver = vi.fn((request: Request) => handleTransferRecoveryInspectionFetch(request, {
  PAGE_STUDIO_RELEASE_ENVIRONMENT: 'production', PAGE_STUDIO_CUSTOMER_PREVIEW_RUNTIME_ENABLED: 'true'
}, run))
const env = () => ({ DASHBOARD_ORIGIN: 'https://app.xeroflow.io', PAGE_STUDIO_CONTROL_SECRET: 's'.repeat(48),
  NATIVE_SCHEMA_TRANSPORT: 'placed-fetch', PAGE_STUDIO_NATIVE_SCHEMA_AUTHORITY: { fetch: receiver } })
const request = (body: unknown = input, suffix = '', method = 'POST') => new Request(`https://xeroflow-control.internal${path}${suffix}`, {
  method, ...(method === 'POST' ? { body: JSON.stringify(body) } : {})
})
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('fetch', upstream)
  mocks.authorize.mockImplementation(async value => ({ purpose: value.purpose, envelopeDigest: await collectionDigest(value) }))
})
afterEach(() => vi.unstubAllGlobals())
it('matches the Studio control-client golden close envelope digest', async () => {
  expect(await collectionDigest(input)).toBe('eaedf9c139a29ea51f1f4897c4b377c4401ceb86456d899721ef19bea727ae72')
})
it('places each inspection through the existing private binding, retaining full envelope identity', async () => {
  const response = await control.fetch(request(), env() as never)
  expect(response.status).toBe(200)
  expect(response.headers.get('x-request-digest')).toBe(await collectionDigest(input))
  expect(await response.json()).toEqual({ purpose: 'close', envelopeDigest: await collectionDigest(input) })
  expect(mocks.authorize).toHaveBeenCalledExactlyOnceWith(input, { runTransaction: run })
  expect(upstream).not.toHaveBeenCalled()
})
it.each(['NATIVE_SCHEMA_TRANSPORT', 'PAGE_STUDIO_NATIVE_SCHEMA_AUTHORITY'])('denies missing %s without public fallback', async key => {
  expect((await control.fetch(request(), { ...env(), [key]: undefined } as never)).status).toBe(503)
  expect(upstream).not.toHaveBeenCalled()
})
it('does not forward recovery inspection on a non-production dashboard', async () => {
  expect((await control.fetch(request(), { ...env(), DASHBOARD_ORIGIN: 'https://preview.agency-dashboard-6cm.pages.dev' } as never)).status).toBe(503)
  expect(upstream).not.toHaveBeenCalled()
  expect(receiver).not.toHaveBeenCalled()
})
it('rejects query and alternate methods before any authority dispatch', async () => {
  expect((await control.fetch(request(input, '?force=1'), env() as never)).status).toBe(400)
  expect((await control.fetch(request(input, '', 'GET'), env() as never)).status).toBe(400)
  expect(receiver).not.toHaveBeenCalled()
  expect(upstream).not.toHaveBeenCalled()
})
it('redacts a fresh authorization denial without retry or fallback', async () => {
  mocks.authorize.mockRejectedValueOnce({ statusCode: 403, message: 'secret sql' })
  const response = await control.fetch(request(), env() as never)
  expect(response.status).toBe(403)
  expect(await response.text()).not.toContain('secret sql')
  expect(receiver).toHaveBeenCalledOnce()
  expect(upstream).not.toHaveBeenCalled()
})
it.each(['redirect', 'oversized', 'utf8', 'wrong-purpose', 'wrong-digest', 'extra', 'throw'])('rejects %s responses without retry', async kind => {
  const fetch = vi.fn(async () => {
    const digest = await collectionDigest(input), headers = { 'x-request-digest': digest }
    if (kind === 'throw') throw new Error('private')
    if (kind === 'redirect') return new Response(null, { status: 302, headers })
    if (kind === 'oversized') return new Response(' '.repeat(16385), { headers })
    if (kind === 'utf8') return new Response(new Uint8Array([255]), { headers })
    return Response.json({ purpose: kind === 'wrong-purpose' ? 'observe' : 'close',
      envelopeDigest: kind === 'wrong-digest' ? 'f'.repeat(64) : digest, ...(kind === 'extra' ? { grant: {} } : {}) }, { headers })
  })
  expect((await control.fetch(request(), { ...env(), PAGE_STUDIO_NATIVE_SCHEMA_AUTHORITY: { fetch } } as never)).status).toBe(503)
  expect(fetch).toHaveBeenCalledOnce()
  expect(upstream).not.toHaveBeenCalled()
})
