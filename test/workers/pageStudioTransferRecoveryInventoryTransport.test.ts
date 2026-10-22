import { beforeEach, expect, it, vi } from 'vitest'
import control from '../../workers/page-studio-control/src/index'
import { handleTransferRecoveryInspectionFetch } from '../../workers/page-studio-management/src/transferRecoveryInspectionFetch'
import { collectionDigest } from '../../shared/pageStudio/collectionApi'
import fixture from '../fixtures/transfer-recovery-inventory.json'
const mocks = vi.hoisted(() => ({ inventory: vi.fn(), inspection: vi.fn() }))
vi.mock('~~/server/utils/pageStudio/customerTransferRecoveryInventory', () => ({ authorizeCustomerTransferRecoveryInventory: mocks.inventory }))
vi.mock('~~/server/utils/pageStudio/customerTransferRecoveryInspection', () => ({ authorizeCustomerTransferRecoveryInspection: mocks.inspection }))
const run = vi.fn()
const path = 'https://xeroflow-control.internal/internal/page-studio/managed-transfers/recovery/inspect'
const receiver = vi.fn((request: Request) => handleTransferRecoveryInspectionFetch(request, {
  PAGE_STUDIO_RELEASE_ENVIRONMENT: 'production', PAGE_STUDIO_CUSTOMER_PREVIEW_RUNTIME_ENABLED: 'true'
}, run))
const env = { DASHBOARD_ORIGIN: 'https://app.xeroflow.io', PAGE_STUDIO_CONTROL_SECRET: 's'.repeat(48),
  NATIVE_SCHEMA_TRANSPORT: 'placed-fetch', PAGE_STUDIO_NATIVE_SCHEMA_AUTHORITY: { fetch: receiver } }
const request = (value: unknown = fixture) => new Request(path, { method: 'POST', body: JSON.stringify(value) })
beforeEach(() => {
  vi.clearAllMocks()
  mocks.inventory.mockImplementation(async value => ({ purpose: 'inventory', envelopeDigest: await collectionDigest(value) }))
})
it('uses only the complete inventory helper for a strict full envelope', async () => {
  const response = await control.fetch(request(), env as never)
  expect(response.status).toBe(200)
  const digest = await collectionDigest(fixture)
  expect(digest).toBe('6561d689abe4c320f6c38a7faf8b4ec9529770da1face945a0780b2f1b7619c1')
  expect(await response.json()).toEqual({ purpose: 'inventory', envelopeDigest: digest })
  expect(response.headers.get('x-request-digest')).toBe(digest)
  expect(mocks.inventory).toHaveBeenCalledExactlyOnceWith(fixture, { runTransaction: run })
  expect(mocks.inspection).not.toHaveBeenCalled()
})
it.each(['source', 'catalogueRequest'])('never downgrades an incomplete %s inventory request to observation', async key => {
  const body = Object.fromEntries(Object.entries(fixture).filter(([name]) => name !== key))
  expect((await control.fetch(request(body), env as never)).status).toBe(400)
  expect(mocks.inventory).not.toHaveBeenCalled()
  expect(mocks.inspection).not.toHaveBeenCalled()
})
it('rejects an observation acknowledgment from the inventory helper', async () => {
  mocks.inventory.mockResolvedValueOnce({ purpose: 'observe', envelopeDigest: await collectionDigest(fixture) })
  expect((await control.fetch(request(), env as never)).status).toBe(503)
})
