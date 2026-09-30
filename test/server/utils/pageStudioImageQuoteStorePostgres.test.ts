import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildImageQuote, readImageGenerationConfig } from '~~/server/utils/pageStudio/imageQuotes'
import { persistImageQuote, readImageQuote } from '~~/server/utils/pageStudio/imageQuoteStore'

const url = process.env.PAGE_STUDIO_IMAGE_DATABASE_TEST_URL
if (url) {
  const target = new URL(url)
  if (!['localhost', '127.0.0.1'].includes(target.hostname) || target.port !== '55461' || target.pathname !== '/studio_cms_receipt' || target.search) throw new Error('Owned local image test database required')
}
const scope = { tenantId: 'image_test', clientId: randomUUID(), businessId: '', siteId: randomUUID(), environment: 'staging' as const }
scope.businessId = scope.clientId
const actor = { actorRole: 'client' as const, actorId: randomUUID() }
const modelId = '@cf/black-forest-labs/flux-1-schnell'
const config = readImageGenerationConfig({ PAGE_STUDIO_IMAGE_CONFIG: JSON.stringify({ gatewayId: 'images-test', priceVersion: 'test-v1', scopes: [scope], models: [{ id: modelId, credits: 10 }] }) }, scope)

describe.runIf(Boolean(url))('durable image quotes on PostgreSQL', () => {
  let pool: pg.Pool
  let schema: string
  const quote = (intentId = randomUUID(), prompt = 'Abstract warm light') => buildImageQuote(config, scope, actor, { intentId, prompt, modelId, aspect: 'native' })
  const run = async <T>(work: (db: pg.PoolClient) => Promise<T>) => {
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
  beforeAll(async () => {
    schema = `image_quotes_${randomUUID().replaceAll('-', '')}`
    const admin = new pg.Client({ connectionString: url })
    await admin.connect()
    await admin.query(`CREATE SCHEMA "${schema}"`)
    await admin.end()
    pool = new pg.Pool({ connectionString: url, max: 5, options: `-c search_path=${schema},pg_catalog -c statement_timeout=6000` })
    await pool.query('CREATE TABLE page_studio_sites(tenant_id text,client_id uuid,id uuid,PRIMARY KEY(tenant_id,client_id,id))')
    await pool.query('INSERT INTO page_studio_sites VALUES($1,$2,$3)', [scope.tenantId, scope.clientId, scope.siteId])
    await pool.query(readFileSync(new URL('../../../server/database/migrations/439_page_studio_image_quotes.sql', import.meta.url), 'utf8'))
  })
  afterAll(async () => {
    if (pool) {
      await pool.query(`DROP SCHEMA "${schema}" CASCADE`)
      await pool.end()
    }
  })
  it('returns the original quote and expiry for an exact replay', async () => {
    const first = await quote()
    const saved = await run(db => persistImageQuote(db, first))
    const replay = await quote(first.intentId)
    expect(replay.quoteId).not.toBe(saved.quoteId)
    expect(await run(db => persistImageQuote(db, replay))).toEqual(saved)
    expect(await run(db => readImageQuote(db, scope, actor, saved.quoteId))).toEqual(saved)
  })
  it('deduplicates simultaneous requests with the same intent', async () => {
    const intentId = randomUUID()
    const proposals = await Promise.all([quote(intentId), quote(intentId)])
    const results = await Promise.all(proposals.map(value => run(db => persistImageQuote(db, value))))
    expect(results[0]).toEqual(results[1])
    expect((await pool.query('SELECT count(*)::int AS count FROM page_studio_image_quotes WHERE intent_id=$1', [intentId])).rows[0].count).toBe(1)
  })
  it('rejects reusing the same intent for changed inputs', async () => {
    const first = await quote()
    await run(db => persistImageQuote(db, first))
    const changed = await quote(first.intentId, 'Different abstract texture')
    await expect(run(db => persistImageQuote(db, changed))).rejects.toMatchObject({ statusCode: 409 })
  })
  it('never extends or spends an expired saved quote', async () => {
    const first = await quote()
    await run(db => persistImageQuote(db, first))
    await pool.query('UPDATE page_studio_image_quotes SET expires_at=clock_timestamp()-INTERVAL \'1 second\' WHERE quote_id=$1', [first.quoteId])
    await expect(run(db => readImageQuote(db, scope, actor, first.quoteId))).rejects.toMatchObject({ code: 'IMAGE_QUOTE_EXPIRED', statusCode: 410 })
    await expect(run(db => persistImageQuote(db, first))).rejects.toMatchObject({ statusCode: 410 })
  })
  it('denies other actors, sites, customers, tenants and environments', async () => {
    const first = await quote()
    await run(db => persistImageQuote(db, first))
    for (const patch of [{ tenantId: 'other' }, { siteId: randomUUID() }, { clientId: randomUUID(), businessId: randomUUID() }, { environment: 'production' as const }]) {
      await expect(run(db => readImageQuote(db, { ...scope, ...patch }, actor, first.quoteId))).rejects.toMatchObject({ statusCode: 404 })
    }
    for (const other of [{ ...actor, actorId: randomUUID() }, { ...actor, actorRole: 'agency' as const }]) {
      await expect(run(db => readImageQuote(db, scope, other, first.quoteId))).rejects.toMatchObject({ statusCode: 404 })
    }
  })
  it('rolls back a quote if the enclosing current-authority check fails', async () => {
    const first = await quote()
    await expect(run(async (db) => {
      await persistImageQuote(db, first)
      throw new Error('Revoked')
    })).rejects.toThrow('Revoked')
    await expect(run(db => readImageQuote(db, scope, actor, first.quoteId))).rejects.toMatchObject({ statusCode: 404 })
  })
})
