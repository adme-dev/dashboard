import type Stripe from 'stripe'
import { beforeEach, expect, it, vi } from 'vitest'
import { runImageCheckout } from '~~/server/utils/pageStudio/imageCheckout'
import type { ImagePurchase } from '~~/server/utils/pageStudio/imagePayments'
import type { ImagePaymentConfig } from '~~/server/utils/pageStudio/imagePaymentConfig'

const now = Date.now()
const pack = { id: 'test100', version: 'v1', currency: 'aud' as const, amountMinor: 1000, credits: 100 }
const config = { accountId: 'acct_test', origin: 'https://new.example.test', packs: [pack] } as ImagePaymentConfig
let row: ImagePurchase, revoked: boolean
const read = vi.fn(async () => {
  if (revoked) throw new Error('Access revoked')
  return structuredClone(row)
})
const saveCustomer = vi.fn(async (id: string) => {
  await read()
  row.customer_id = id
  return read()
})
const saveCheckout = vi.fn(async (id: string, url: string) => {
  await read()
  row.checkout_id = id
  row.checkout_url = url
  return read()
})
const provider = {
  accounts: { retrieveCurrent: vi.fn(async () => ({ id: 'acct_test' })) },
  customers: { create: vi.fn(async () => ({ id: 'cus_test', livemode: false })) },
  checkout: { sessions: { create: vi.fn(async () => ({ id: 'cs_test_first', url: 'https://checkout.stripe.com/c/pay/cs_test_first', livemode: false, customer: 'cus_test', amount_total: 1000, currency: 'aud' })) } }
}
const run = () => runImageCheckout(config, { read, saveCustomer, saveCheckout }, provider as unknown as Stripe, () => now)
beforeEach(() => {
  vi.clearAllMocks()
  revoked = false
  row = { intent_id: '30000000-0000-4000-8000-000000000003', pack, account_id: 'acct_test', fingerprint: 'a'.repeat(64), environment: 'staging', return_origin: 'https://original.example.test', created_at: new Date(now), customer_id: null, checkout_id: null, checkout_url: null, funded: false } as ImagePurchase
})
it('persists customer before checkout and uses only saved price, origin and stable idempotency', async () => {
  expect(await run()).toMatchObject({ status: 'checkout', checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_test_first' })
  expect(saveCustomer.mock.invocationCallOrder[0]).toBeLessThan(provider.checkout.sessions.create.mock.invocationCallOrder[0]!)
  const [params, options] = vi.mocked(provider.checkout.sessions.create).mock.calls[0] as unknown as [Stripe.Checkout.SessionCreateParams, Stripe.RequestOptions]
  expect(params.success_url).toContain('https://original.example.test/studio/credits?')
  expect(params.line_items?.[0]?.price_data?.unit_amount).toBe(1000)
  expect(params.expires_at).toBe(Math.floor(now / 1000) + 3600)
  expect(options.idempotencyKey).toBe(`studio-image-checkout-v1:${row.intent_id}`)
  await run()
  expect(provider.checkout.sessions.create).toHaveBeenCalledTimes(1)
})
it('retries unknown checkout with identical provider parameters and without a second customer', async () => {
  provider.checkout.sessions.create.mockRejectedValueOnce(new Error('Timeout'))
  await expect(run()).rejects.toThrow()
  expect(row.customer_id).toBe('cus_test')
  await run()
  expect(provider.customers.create).toHaveBeenCalledTimes(1)
  expect(provider.checkout.sessions.create.mock.calls[0]).toEqual(provider.checkout.sessions.create.mock.calls[1])
})
it('does not reuse an old idempotency key for provider writes or change a funded purchase', async () => {
  row.created_at = new Date(now - 26 * 60_000)
  expect(await run()).toMatchObject({ status: 'expired' })
  expect(provider.customers.create).not.toHaveBeenCalled()
  row.funded = true
  expect(await run()).toMatchObject({ status: 'confirmed' })
})
it('rejects mismatched account and live provider responses before checkout is returned', async () => {
  provider.accounts.retrieveCurrent.mockResolvedValueOnce({ id: 'acct_other' })
  await expect(run()).rejects.toThrow()
  expect(provider.customers.create).not.toHaveBeenCalled()
  provider.customers.create.mockResolvedValueOnce({ id: 'cus_test', livemode: true })
  await expect(run()).rejects.toThrow()
  expect(saveCustomer).not.toHaveBeenCalled()
})
it('rechecks billing authority after provider IO and never returns a URL after revocation', async () => {
  provider.checkout.sessions.create.mockImplementationOnce(async () => {
    revoked = true
    return { id: 'cs_test_first', url: 'https://checkout.stripe.com/c/pay/cs_test_first', livemode: false, customer: 'cus_test', amount_total: 1000, currency: 'aud' }
  })
  await expect(run()).rejects.toThrow('Access revoked')
  expect(row.checkout_id).toBeNull()
})
