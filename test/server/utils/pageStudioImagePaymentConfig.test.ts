import { expect, it } from 'vitest'
import { readImagePaymentConfig, imagePaymentPack } from '~~/server/utils/pageStudio/imagePaymentConfig'

const scope = { tenantId: 'test_tenant', clientId: '10000000-0000-4000-8000-000000000001', environment: 'staging' as const }
const pack = { id: 'test100', version: 'test-v1', currency: 'aud', amountMinor: 1000, credits: 100 }
const config = { mode: 'test', accountId: 'acct_fixture', origin: 'https://preview.example.test', scopes: [scope], packs: [pack] }
const env = (patch = {}, secret = 'sk_test_fixture') => ({ PAGE_STUDIO_IMAGE_PAYMENTS: JSON.stringify({ ...config, ...patch }), PAGE_STUDIO_IMAGE_STRIPE_SECRET: secret, PAGE_STUDIO_IMAGE_STRIPE_WEBHOOK_SECRET: 'whsec_fixture' })

it('requires explicit staging test configuration and returns server-owned versioned packs', () => {
  const admitted = readImagePaymentConfig(env(), scope)
  expect(imagePaymentPack(admitted, 'test100', 'test-v1')).toEqual(pack)
  expect(admitted.origin).toBe('https://preview.example.test')
  expect(() => imagePaymentPack(admitted, 'test100', 'old')).toThrow('price')
})
it('rejects live keys, live mode, production and unknown customers', () => {
  expect(() => readImagePaymentConfig(env({}, 'sk_live_fixture'), scope)).toThrow('configured')
  expect(() => readImagePaymentConfig(env({ mode: 'live' }), scope)).toThrow('configured')
  expect(() => readImagePaymentConfig(env(), { ...scope, environment: 'production' })).toThrow('configured')
  expect(() => readImagePaymentConfig(env(), { ...scope, clientId: '20000000-0000-4000-8000-000000000002' })).toThrow('configured')
})
it('does not enable top-ups from absent or partial configuration', () => {
  for (const value of [{}, { ...env(), PAGE_STUDIO_IMAGE_STRIPE_WEBHOOK_SECRET: '' }, { ...env(), PAGE_STUDIO_IMAGE_PAYMENTS: '{' }]) {
    expect(() => readImagePaymentConfig(value, scope)).toThrow('configured')
  }
})
it('rejects redirects with credentials, paths, query, fragment, local addresses or HTTP', () => {
  for (const origin of ['http://preview.example.test', 'https://a:b@preview.example.test', 'https://preview.example.test/evil', 'https://preview.example.test?x=y', 'https://preview.example.test/#x', 'https://localhost', 'https://127.0.0.1']) {
    expect(() => readImagePaymentConfig(env({ origin }), scope)).toThrow('configured')
  }
})
it('rejects duplicate or fractional packs and bounds accounting inputs', () => {
  for (const packs of [[pack, pack], [{ ...pack, credits: 0.5 }], [{ ...pack, amountMinor: 0 }], [{ ...pack, currency: 'AUD' }], [{ ...pack, credits: Number.MAX_SAFE_INTEGER }]]) {
    expect(() => readImagePaymentConfig(env({ packs }), scope)).toThrow('configured')
  }
})

it('can disable all new purchases while retaining verification of existing payment events', () => {
  const disabled = env({ scopes: [] })
  expect(readImagePaymentConfig(disabled).accountId).toBe('acct_fixture')
  expect(() => readImagePaymentConfig(disabled, scope)).toThrow('configured')
})
