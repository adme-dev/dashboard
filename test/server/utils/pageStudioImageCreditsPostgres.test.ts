import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { finishImageCredits, grantImageCredits, readImageCredits, readImageCreditHistory, reserveImageCredits } from '~~/server/utils/pageStudio/imageCredits'

const url = process.env.PAGE_STUDIO_IMAGE_DATABASE_TEST_URL
if (url) {
  const target = new URL(url)
  if (!['localhost', '127.0.0.1'].includes(target.hostname) || target.port !== '55461' || target.pathname !== '/studio_cms_receipt' || target.search) {
    throw new Error('Image credit tests require the owned localhost:55461/studio_cms_receipt database')
  }
}
const scope = { tenantId: 'tenant_test', clientId: '10000000-0000-4000-8000-000000000001', environment: 'staging' as const }
const second = { ...scope, clientId: '20000000-0000-4000-8000-000000000002' }
const siteId = '30000000-0000-4000-8000-000000000003'
const secondSite = '40000000-0000-4000-8000-000000000004'
const fingerprint = 'a'.repeat(64)

describe.runIf(Boolean(url))('image credit accounting on real PostgreSQL', () => {
  let pool: pg.Pool
  let schema: string
  const tx = async <T>(work: (db: pg.PoolClient) => Promise<T>) => {
    const db = await pool.connect()
    try {
      await db.query('BEGIN')
      const value = await work(db)
      await db.query('COMMIT')
      return value
    } catch (error) {
      await db.query('ROLLBACK')
      throw error
    } finally { db.release() }
  }
  const balance = (s = scope) => tx(db => readImageCredits(db, s))
  const grant = (entryId = 'payment:first', credits = 100) => tx(db => grantImageCredits(db, scope, { entryId, credits, fingerprint }))
  const reserve = (reservationId = 'intent_first', credits = 70, s = scope, patch = {}) => tx(db => reserveImageCredits(db, s, {
    reservationId, siteId, actorId: 'editor_1', actorRole: 'client', credits, fingerprint, ...patch
  }))
  const finish = (outcome: 'settled' | 'released', reservationId = 'intent_first', s = scope) => tx(db => finishImageCredits(db, s, reservationId, outcome))

  beforeAll(async () => {
    schema = `image_credits_${randomUUID().replaceAll('-', '')}`
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
  })
  beforeEach(async () => {
    await pool.query('TRUNCATE page_studio_image_credit_entries,page_studio_image_credit_reservations,page_studio_image_wallets,page_studio_sites,agency_clients CASCADE')
    await pool.query('INSERT INTO agency_clients VALUES($1),($2)', [scope.clientId, second.clientId])
    await pool.query('INSERT INTO page_studio_sites VALUES($1,$2,$3),($1,$2,$4),($1,$5,$6)', [scope.tenantId, scope.clientId, siteId, secondSite, second.clientId, '50000000-0000-4000-8000-000000000005'])
  })
  afterAll(async () => {
    if (pool) {
      await pool.query(`DROP SCHEMA "${schema}" CASCADE`)
      await pool.end()
    }
  })

  it('returns an empty account without creating credit', async () => {
    expect(await balance()).toEqual({ balance: 0, reserved: 0, available: 0, frozen: false })
  })
  it('reserves, replays and settles exactly once', async () => {
    await grant()
    expect(await reserve()).toMatchObject({ admitted: true, state: 'reserved' })
    expect(await reserve()).toMatchObject({ admitted: false, state: 'reserved' })
    expect(await balance()).toEqual({ balance: 100, reserved: 70, available: 30, frozen: false })
    await finish('settled')
    await finish('settled')
    expect(await balance()).toEqual({ balance: 30, reserved: 0, available: 30, frozen: false })
    expect((await pool.query('SELECT count(*)::int AS count FROM page_studio_image_credit_entries WHERE credit_delta<0')).rows[0].count).toBe(1)
    expect(await reserve()).toMatchObject({ admitted: false, state: 'settled' })
  })
  it('releases confirmed failure once and never permits opposite settlement', async () => {
    await grant()
    await reserve()
    await finish('released')
    await finish('released')
    expect(await balance()).toMatchObject({ balance: 100, reserved: 0, available: 100 })
    await expect(finish('settled')).rejects.toMatchObject({ statusCode: 409 })
  })
  it('rejects reservation identity reuse with different actor, site, cost or input', async () => {
    await grant()
    await reserve()
    for (const patch of [{ actorId: 'other' }, { actorRole: 'agency' }, { siteId: secondSite }, { fingerprint: 'b'.repeat(64) }]) {
      await expect(reserve('intent_first', 70, scope, patch)).rejects.toMatchObject({ statusCode: 409 })
    }
    await expect(reserve('intent_first', 20)).rejects.toMatchObject({ statusCode: 409 })
    expect(await balance()).toMatchObject({ balance: 100, reserved: 70 })
  })
  it('prevents concurrent overspend across two sites', async () => {
    await grant()
    const outcomes = await Promise.allSettled([reserve('one'), reserve('two', 70, scope, { siteId: secondSite })])
    expect(outcomes.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(outcomes.find(result => result.status === 'rejected')).toMatchObject({ reason: { code: 'IMAGE_CREDITS_INSUFFICIENT' } })
    expect(await balance()).toMatchObject({ balance: 100, reserved: 70, available: 30 })
  })
  it('deduplicates simultaneous payment grants and rejects different credit values', async () => {
    await Promise.all([grant(), grant()])
    expect(await balance()).toMatchObject({ balance: 100, available: 100 })
    await expect(grant('payment:first', 200)).rejects.toMatchObject({ statusCode: 409 })
    expect((await pool.query('SELECT count(*)::int AS count FROM page_studio_image_credit_entries')).rows[0].count).toBe(1)
  })
  it('isolates customer and environment balances and reservation settlement', async () => {
    await grant()
    await reserve()
    expect(await balance(second)).toMatchObject({ balance: 0 })
    const production = { ...scope, environment: 'production' as const }
    expect(await tx(db => readImageCredits(db, production))).toMatchObject({ balance: 0 })
    await expect(finish('settled', 'intent_first', second)).rejects.toMatchObject({ statusCode: 404 })
    await expect(tx(db => finishImageCredits(db, production, 'intent_first', 'settled'))).rejects.toMatchObject({ statusCode: 404 })
    expect(await balance()).toMatchObject({ balance: 100, reserved: 70 })
  })
  it('rejects fractional, negative, zero and unsafe credit amounts', async () => {
    for (const credits of [0, -1, 0.5, Number.MAX_SAFE_INTEGER, Infinity]) {
      await expect(grant('invalid', credits)).rejects.toMatchObject({ statusCode: 400 })
      await expect(reserve('invalid', credits)).rejects.toMatchObject({ statusCode: 400 })
    }
    expect(await balance()).toMatchObject({ balance: 0 })
  })
  it('rolls back credits when the enclosing authorized transaction fails', async () => {
    await expect(tx(async (db) => {
      await grantImageCredits(db, scope, { entryId: 'payment:rollback', credits: 100, fingerprint })
      throw new Error('Authority revoked')
    })).rejects.toThrow('Authority revoked')
    expect(await balance()).toMatchObject({ balance: 0 })
  })
  it('keeps journal immutable even if an application query tries to rewrite history', async () => {
    await grant()
    await expect(pool.query('UPDATE page_studio_image_credit_entries SET credit_delta=999')).rejects.toMatchObject({ code: '55000' })
    await expect(pool.query('DELETE FROM page_studio_image_credit_entries')).rejects.toMatchObject({ code: '55000' })
    expect(await balance()).toMatchObject({ balance: 100 })
  })
  it('denies new reservations on a frozen wallet while preserving settlement', async () => {
    await grant()
    await reserve()
    await pool.query('UPDATE page_studio_image_wallets SET frozen=true')
    await expect(reserve('second', 10)).rejects.toMatchObject({ code: 'IMAGE_CREDITS_FROZEN' })
    await finish('settled')
    expect(await balance()).toEqual({ balance: 30, reserved: 0, available: 0, frozen: true })
  })
  it('restricts editor history to their site and paginates without exposing prompts', async () => {
    await grant()
    await reserve('site_one', 20)
    await finish('settled', 'site_one')
    await reserve('site_two', 30, scope, { siteId: secondSite })
    await finish('settled', 'site_two')
    const first = await tx(db => readImageCreditHistory(db, scope, { siteId, limit: 1 }))
    expect(first.items).toHaveLength(1)
    expect(first.items[0]).toMatchObject({ kind: 'settle', credits: -20 })
    expect(first.nextCursor).not.toBeNull()
    const secondPage = await tx(db => readImageCreditHistory(db, scope, { siteId, limit: 1, before: first.nextCursor! }))
    expect(secondPage.items).toHaveLength(1)
    expect(secondPage.items[0]).toMatchObject({ kind: 'reserve', reserved: 20 })
    expect(secondPage.nextCursor).toBeNull()
    expect(JSON.stringify(first)).not.toContain('site_two')
    expect(first.items[0]).not.toHaveProperty('fingerprint')
    expect((await tx(db => readImageCreditHistory(db, scope, { limit: 20 }))).items).toHaveLength(5)
    expect((await tx(db => readImageCreditHistory(db, second, { limit: 20 }))).items).toEqual([])
  })
})
