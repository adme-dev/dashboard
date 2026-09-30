import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import pg from 'pg'
import Stripe from 'stripe'
import { verifyImagePaymentEvent } from '../../../workers/page-studio-payments/src/provider'
import { readImagePaymentConfig } from '~~/server/utils/pageStudio/imagePaymentConfig'
import { retrieveImagePaymentSnapshot } from '~~/server/utils/pageStudio/imagePaymentSnapshot'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { bindImagePurchaseCustomer, bindImagePurchaseCheckout, createImagePurchaseIntent, observeImagePayment, readImagePurchase } from '~~/server/utils/pageStudio/imagePayments'
import { readImageCredits, reserveImageCredits, finishImageCredits } from '~~/server/utils/pageStudio/imageCredits'

const url = process.env.PAGE_STUDIO_IMAGE_DATABASE_TEST_URL
if (url) {
  const target = new URL(url)
  if (!['localhost', '127.0.0.1'].includes(target.hostname) || target.port !== '55461' || target.pathname !== '/studio_cms_receipt' || target.search) throw new Error('Payment tests require the owned localhost:55461/studio_cms_receipt database')
}
const scope = { tenantId: 'test', clientId: '10000000-0000-4000-8000-000000000001', environment: 'staging' as const }
const siteId = '20000000-0000-4000-8000-000000000002'
const intentId = '30000000-0000-4000-8000-000000000003'
const pack = { id: 'test100', version: 'v1', currency: 'aud' as const, amountMinor: 1000, credits: 100 }
const purchase = { intentId, siteId, actorId: 'billing_owner', accountId: 'acct_test', pack, returnOrigin: 'https://preview.example.test' }
const observation = { eventId: 'evt_first', eventFingerprint: 'a'.repeat(64), accountId: 'acct_test', customerId: 'cus_test', checkoutId: 'cs_test_first', paymentId: 'pi_first', chargeId: 'ch_first', amountMinor: 1000, currency: 'aud', livemode: false as const, paid: true, refundedMinor: 0, dispute: null }

describe.runIf(Boolean(url))('verified image payment accounting on PostgreSQL', () => {
  let pool: pg.Pool, schema: string
  const tx = async <T>(work: (db: pg.PoolClient) => Promise<T>) => {
    const db = await pool.connect()
    try {
      await db.query('BEGIN')
      const result = await work(db)
      await db.query('COMMIT')
      return result
    } catch (error) {
      await db.query('ROLLBACK')
      throw error
    } finally { db.release() }
  }
  const balance = () => tx(db => readImageCredits(db, scope))
  const observe = (patch = {}) => tx(db => observeImagePayment(db, scope, intentId, { ...observation, ...patch }))
  const prepare = async (patch = {}) => {
    await tx(db => createImagePurchaseIntent(db, scope, { ...purchase, ...patch }))
    await tx(db => bindImagePurchaseCustomer(db, scope, intentId, 'cus_test'))
    await tx(db => bindImagePurchaseCheckout(db, scope, intentId, { checkoutId: 'cs_test_first', url: 'https://checkout.stripe.com/c/pay/cs_test_first#fixture' }))
  }
  beforeAll(async () => {
    schema = `image_payments_${randomUUID().replaceAll('-', '')}`
    const admin = new pg.Client({ connectionString: url })
    await admin.connect()
    try {
      await admin.query(`CREATE SCHEMA "${schema}"`)
    } finally {
      await admin.end()
    }
    pool = new pg.Pool({ connectionString: url, max: 6, options: `-c search_path=${schema},pg_catalog -c statement_timeout=6000 -c lock_timeout=4000` })
    await pool.query('CREATE TABLE agency_clients(id uuid PRIMARY KEY)')
    await pool.query('CREATE TABLE page_studio_sites(tenant_id text,client_id uuid,id uuid, PRIMARY KEY(tenant_id,client_id,id))')
    await pool.query(readFileSync(new URL('../../../server/database/migrations/438_page_studio_image_credits.sql', import.meta.url), 'utf8'))
    await pool.query(readFileSync(new URL('../../../server/database/migrations/441_page_studio_image_payments.sql', import.meta.url), 'utf8'))
  })
  beforeEach(async () => {
    await pool.query('TRUNCATE page_studio_image_payment_events,page_studio_image_purchases,page_studio_image_credit_entries,page_studio_image_credit_reservations,page_studio_image_wallets,page_studio_sites,agency_clients CASCADE')
    await pool.query('INSERT INTO agency_clients VALUES($1)', [scope.clientId])
    await pool.query('INSERT INTO page_studio_sites VALUES($1,$2,$3)', [scope.tenantId, scope.clientId, siteId])
    await prepare()
  })
  afterAll(async () => {
    if (pool) {
      await pool.query(`DROP SCHEMA "${schema}" CASCADE`)
      await pool.end()
    }
  })
  it('persists checkout without granting credits and rejects re-priced intent replay', async () => {
    await prepare()
    expect(await balance()).toMatchObject({ balance: 0 })
    await expect(prepare({ pack: { ...pack, credits: 200 } })).rejects.toThrow()
    await observe({ paid: false })
    expect(await balance()).toMatchObject({ balance: 0 })
    await observe({ eventId: 'evt_delayed', paid: true })
    expect(await balance()).toMatchObject({ balance: 100 })
  })
  it('deduplicates concurrent events and different events for the same payment', async () => {
    await Promise.all([observe(), observe(), observe({ eventId: 'evt_second' })])
    expect(await balance()).toMatchObject({ balance: 100 })
    expect((await pool.query('SELECT count(*)::int AS n FROM page_studio_image_credit_entries WHERE kind=\'grant\'')).rows[0].n).toBe(1)
  })
  it('rejects mismatched amount, currency, customer, account, checkout and live events', async () => {
    for (const patch of [{ amountMinor: 999 }, { currency: 'usd' }, { customerId: 'cus_foreign' }, { accountId: 'acct_foreign' }, { checkoutId: 'cs_test_foreign' }, { livemode: true }]) await expect(observe(patch)).rejects.toThrow()
    expect(await balance()).toMatchObject({ balance: 0 })
  })
  it('does not mint available credits when a refund arrives before paid fulfillment', async () => {
    await observe({ paid: false, refundedMinor: 1000 })
    await observe({ eventId: 'evt_paid_late', refundedMinor: 0 })
    expect(await balance()).toMatchObject({ balance: 0, available: 0 })
  })
  it('aggregates partial refunds monotonically and rounds using exact integer arithmetic', async () => {
    await observe()
    await observe({ eventId: 'evt_refund_1', refundedMinor: 201 })
    expect(await balance()).toMatchObject({ balance: 79 })
    await observe({ eventId: 'evt_old_refund', refundedMinor: 100 })
    await observe({ eventId: 'evt_refund_2', refundedMinor: 400 })
    await observe({ eventId: 'evt_refund_2', refundedMinor: 400 })
    expect(await balance()).toMatchObject({ balance: 60 })
  })
  it('retains reservations and freezes spending after reversing spent credits', async () => {
    await observe()
    await tx(db => reserveImageCredits(db, scope, { reservationId: 'generated', siteId, actorId: 'editor', actorRole: 'client', credits: 80, fingerprint: 'b'.repeat(64) }))
    await tx(db => finishImageCredits(db, scope, 'generated', 'settled'))
    await observe({ eventId: 'evt_dispute', dispute: { id: 'du_test', status: 'active' } })
    expect(await balance()).toMatchObject({ balance: -80, available: 0, frozen: true })
    await observe({ eventId: 'evt_won', dispute: { id: 'du_test', status: 'won' } })
    expect(await balance()).toMatchObject({ balance: 20, frozen: true })
    await observe({ eventId: 'evt_stale_active', dispute: { id: 'du_test', status: 'active' } })
    expect(await balance()).toMatchObject({ balance: 20 })
  })
  it('does not double-debit overlapping refund and dispute compensation', async () => {
    await observe()
    await observe({ eventId: 'evt_refund', refundedMinor: 400 })
    await observe({ eventId: 'evt_dispute', dispute: { id: 'du_test', status: 'active' } })
    expect(await balance()).toMatchObject({ balance: 0 })
    await observe({ eventId: 'evt_won', dispute: { id: 'du_test', status: 'won' } })
    expect(await balance()).toMatchObject({ balance: 60 })
  })
  it('isolates environments and rejects provider payment reassignment or altered event replay', async () => {
    await expect(tx(db => observeImagePayment(db, { ...scope, environment: 'production' }, intentId, observation))).rejects.toThrow()
    await observe()
    await expect(observe({ eventId: 'evt_new_payment', paymentId: 'pi_other' })).rejects.toThrow()
    await expect(observe({ eventFingerprint: 'b'.repeat(64) })).rejects.toThrow()
    expect(await balance()).toMatchObject({ balance: 100 })
  })
  it('keeps the journal and event records immutable and rolls back atomically', async () => {
    await expect(tx(async (db) => {
      await observeImagePayment(db, scope, intentId, observation)
      throw new Error('Rollback')
    })).rejects.toThrow('Rollback')
    expect(await balance()).toMatchObject({ balance: 0 })
    await observe()
    await expect(pool.query('DELETE FROM page_studio_image_payment_events')).rejects.toThrow('immutable')
    await expect(pool.query('DELETE FROM page_studio_image_credit_entries')).rejects.toThrow('immutable')
  })
  it('protects persisted purchase identity from later changes', async () => {
    await expect(pool.query('UPDATE page_studio_image_purchases SET pack=pack || \'{"credits":200}\'::jsonb')).rejects.toThrow('immutable')
    await expect(pool.query('UPDATE page_studio_image_purchases SET customer_id=\'cus_rebound\'')).rejects.toThrow('immutable')
  })
  it('prevents a provider payment being credited to a second purchase', async () => {
    await observe()
    const otherId = '40000000-0000-4000-8000-000000000004'
    await tx(async (db) => {
      await createImagePurchaseIntent(db, scope, { ...purchase, intentId: otherId })
      await bindImagePurchaseCustomer(db, scope, otherId, 'cus_other')
      await bindImagePurchaseCheckout(db, scope, otherId, { checkoutId: 'cs_test_other', url: 'https://checkout.stripe.com/c/pay/cs_test_other' })
    })
    await expect(tx(db => observeImagePayment(db, scope, otherId, { ...observation, eventId: 'evt_other_intent', customerId: 'cus_other', checkoutId: 'cs_test_other' }))).rejects.toThrow()
    expect(await balance()).toMatchObject({ balance: 100 })
  })
  it('holds pending refunds before funding and reinstates failed refunds exactly once', async () => {
    const refund = { id: 're_first', amountMinor: 1000, status: 'pending' }
    await observe({ paid: false, refunds: [refund] })
    await observe({ eventId: 'evt_paid_after_pending', refunds: [refund] })
    expect(await balance()).toMatchObject({ balance: 0 })
    await observe({ eventId: 'evt_refund_failed', refunds: [{ ...refund, status: 'failed' }] })
    expect(await balance()).toMatchObject({ balance: 100 })
    await observe({ eventId: 'evt_stale_refund', refundedMinor: 1000, refunds: [{ ...refund, status: 'succeeded' }] })
    await observe({ eventId: 'evt_refund_failed', refunds: [{ ...refund, status: 'failed' }] })
    expect(await balance()).toMatchObject({ balance: 100 })
  })
  it('separates canceled refunds from subsequent refunds without repricing a refund identity', async () => {
    await observe({ refundedMinor: 400, refunds: [{ id: 're_first', amountMinor: 400, status: 'succeeded' }] })
    await observe({ eventId: 'evt_canceled', refunds: [{ id: 're_first', amountMinor: 400, status: 'canceled' }] })
    await observe({ eventId: 'evt_new_refund', refundedMinor: 200, refunds: [{ id: 're_next', amountMinor: 200, status: 'succeeded' }] })
    expect(await balance()).toMatchObject({ balance: 80 })
    await expect(observe({ eventId: 'evt_altered_refund', refunds: [{ id: 're_next', amountMinor: 100, status: 'succeeded' }] })).rejects.toThrow()
  })
  it('integrates real SDK signature verification and provider identity checks with one PostgreSQL grant', async () => {
    const config = readImagePaymentConfig({ PAGE_STUDIO_IMAGE_PAYMENTS: JSON.stringify({ mode: 'test', accountId: 'acct_test', origin: purchase.returnOrigin, scopes: [scope], packs: [pack] }), PAGE_STUDIO_IMAGE_STRIPE_SECRET: 'sk_test_fixture', PAGE_STUDIO_IMAGE_STRIPE_WEBHOOK_SECRET: 'whsec_fixture' })
    const saved = await tx(db => readImagePurchase(db, scope, intentId))
    const metadata = { studio_image_purchase: intentId, studio_image_fingerprint: saved.fingerprint, studio_image_environment: 'staging', studio_image_feature: 'credits-v1' }
    const charge = { id: 'ch_first', object: 'charge', customer: 'cus_test', payment_intent: 'pi_first', livemode: false, paid: true, captured: true, amount: 1000, amount_captured: 1000, amount_refunded: 0, currency: 'aud', disputed: false }
    const session = { id: 'cs_test_first', customer: 'cus_test', livemode: false, payment_status: 'paid', status: 'complete', mode: 'payment', amount_total: 1000, currency: 'aud', payment_intent: 'pi_first', metadata }
    const provider = { accounts: { retrieveCurrent: async () => ({ id: 'acct_test' }) }, checkout: { sessions: { retrieve: async () => session } },
      paymentIntents: { retrieve: async () => ({ id: 'pi_first', customer: 'cus_test', livemode: false, status: 'succeeded', amount: 1000, amount_received: 1000, currency: 'aud', latest_charge: charge, metadata }) },
      refunds: { list: async () => ({ data: [], has_more: false }) } } as unknown as Stripe
    const raw = JSON.stringify({ id: 'evt_integrated', type: 'checkout.session.completed', livemode: false, data: { object: { id: 'cs_test_first' } } })
    const stripe = new Stripe('sk_test_fixture')
    const signature = await stripe.webhooks.generateTestHeaderStringAsync({ payload: raw, secret: config.webhookSecret, cryptoProvider: Stripe.createSubtleCryptoProvider() })
    const verified = await verifyImagePaymentEvent(config, raw, signature)
    const snapshot = await retrieveImagePaymentSnapshot(config, verified, id => tx(db => readImagePurchase(db, scope, id)), provider)
    expect(snapshot).not.toBeNull()
    await Promise.all([1, 2].map(() => tx(db => observeImagePayment(db, snapshot!.scope, snapshot!.intentId, snapshot!.observation))))
    expect(await balance()).toMatchObject({ balance: 100, available: 100 })
  })
})
