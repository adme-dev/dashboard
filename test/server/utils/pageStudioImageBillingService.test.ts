import { beforeEach, expect, it, vi } from 'vitest'
import { createImageCheckout, imageBillingCatalog, imageBillingReceipt } from '~~/server/utils/pageStudio/imageBillingService'
import { ImageCreditError } from '~~/server/utils/pageStudio/imageCredits'

const mocks = vi.hoisted(() => ({ authority: vi.fn(), generation: vi.fn(), query: vi.fn(), read: vi.fn(), create: vi.fn(), run: vi.fn() }))
vi.mock('~~/server/utils/pageStudio/imageBillingAuthority', () => ({ withImageBillingAuthority: mocks.authority }))
vi.mock('~~/server/utils/pageStudio/imageGenerationAuthority', () => ({ withImageGenerationAuthority: mocks.generation }))
vi.mock('~~/server/utils/pageStudio/imagePayments', () => ({ readImagePurchase: mocks.read, createImagePurchaseIntent: mocks.create, bindImagePurchaseCustomer: vi.fn(), bindImagePurchaseCheckout: vi.fn() }))
vi.mock('~~/server/utils/pageStudio/imageCheckout', () => ({ runImageCheckout: mocks.run }))
const scope = { tenantId: 'test', clientId: '10000000-0000-4000-8000-000000000001', siteId: '20000000-0000-4000-8000-000000000002', environment: 'staging' as const }
const pack = { id: 'test100', version: 'v1', currency: 'aud', amountMinor: 1000, credits: 100 }
const context = { scope, actor: { actorId: 'owner' }, canPurchase: true }
const input = { intentId: '30000000-0000-4000-8000-000000000003', packId: pack.id, packVersion: pack.version }
const row = { intent_id: input.intentId, site_id: scope.siteId, actor_id: 'owner', account_id: 'acct_test', fingerprint: 'a'.repeat(64), pack, created_at: new Date(), refunded_minor: '0', compensated_credits: '0', funded: false, customer_id: 'cus_private' }
const env = { PAGE_STUDIO_IMAGE_PAYMENTS: JSON.stringify({ mode: 'test', accountId: 'acct_test', origin: 'https://preview.example.test', scopes: [{ tenantId: scope.tenantId, clientId: scope.clientId, environment: scope.environment }], packs: [{ ...pack, version: 'v2', amountMinor: 1200 }] }), PAGE_STUDIO_IMAGE_STRIPE_SECRET: 'sk_test_fixture', PAGE_STUDIO_IMAGE_STRIPE_WEBHOOK_SECRET: 'whsec_fixture' }
const request = { siteId: scope.siteId, actor: { role: 'client' as const, actorId: 'owner', clientId: scope.clientId }, env }
beforeEach(() => {
  vi.resetAllMocks()
  mocks.authority.mockImplementation((_request, work) => work({ query: mocks.query }, context))
  mocks.generation.mockImplementation((_request, _writing, work) => work({ query: mocks.query }, context))
  mocks.read.mockResolvedValue(row)
  mocks.query.mockResolvedValue({ rows: [row] })
  mocks.run.mockResolvedValue({ intentId: input.intentId, status: 'pending' })
})
it('resumes the saved pack version after config repricing without creating a new intent', async () => {
  await expect(createImageCheckout(request, input)).resolves.toMatchObject({ status: 'pending' })
  expect(mocks.create).not.toHaveBeenCalled()
  const store = mocks.run.mock.calls[0][1]
  expect(await store.read()).toMatchObject({ pack })
  expect(mocks.authority).toHaveBeenCalledTimes(2)
})
it('rejects stale pricing for new purchases and scope/actor conflicts before provider calls', async () => {
  mocks.read.mockRejectedValueOnce(new ImageCreditError('IMAGE_PURCHASE_NOT_FOUND', 404, 'Missing'))
  await expect(createImageCheckout(request, input)).rejects.toThrow('price')
  mocks.read.mockResolvedValueOnce({ ...row, actor_id: 'other' })
  await expect(createImageCheckout(request, input)).rejects.toThrow('saved purchase')
  expect(mocks.run).not.toHaveBeenCalled()
})
it('keeps historical receipts readable without payment config and omits provider identity', async () => {
  const result = await imageBillingReceipt({ ...request, env: {} }, { intentId: input.intentId })
  expect(result).toMatchObject({ status: 'pending', pack })
  expect(JSON.stringify(result)).not.toContain('cus_private')
  const catalog = await imageBillingCatalog({ ...request, env: {} })
  expect(catalog).toMatchObject({ available: false, purchases: [{ intentId: input.intentId }] })
})
it('does not read customer purchase history for non-billing users', async () => {
  mocks.generation.mockImplementation((_request, _writing, work) => work({ query: mocks.query }, { ...context, canPurchase: false }))
  expect(await imageBillingCatalog(request)).toMatchObject({ available: false, canPurchase: false, packs: [] })
  expect(mocks.query).not.toHaveBeenCalled()
})
