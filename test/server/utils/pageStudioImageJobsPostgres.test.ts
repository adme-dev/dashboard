import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildImageQuote, readImageGenerationConfig } from '~~/server/utils/pageStudio/imageQuotes'
import { persistImageQuote } from '~~/server/utils/pageStudio/imageQuoteStore'
import { grantImageCredits, readImageCredits } from '~~/server/utils/pageStudio/imageCredits'
import { createImageJob, claimImageJob, completeImageJob, failImageJob, markImageJobUncertain, readImageJob, readImageLibrary, takeImageDispatchBatch, cancelQueuedImageJob, recoverStaleImageJobs } from '~~/server/utils/pageStudio/imageJobs'

const url = process.env.PAGE_STUDIO_IMAGE_DATABASE_TEST_URL
if (url) {
  const target = new URL(url)
  if (!['localhost', '127.0.0.1'].includes(target.hostname) || target.port !== '55461' || target.pathname !== '/studio_cms_receipt' || target.search) throw new Error('Owned local image test database required')
}
const scope = { tenantId: 'image_test', clientId: randomUUID(), businessId: '', siteId: randomUUID(), environment: 'staging' as const }
scope.businessId = scope.clientId
const actor = { actorRole: 'client' as const, actorId: randomUUID() }
const wallet = { tenantId: scope.tenantId, clientId: scope.clientId, environment: scope.environment }
const modelId = '@cf/black-forest-labs/flux-1-schnell'
const config = readImageGenerationConfig({ PAGE_STUDIO_IMAGE_CONFIG: JSON.stringify({ gatewayId: 'images-test', priceVersion: 'test-v1', scopes: [scope], models: [{ id: modelId, credits: 70 }] }) }, scope)
const principal = { source: 'native-login' as const, login: { role: actor.actorRole, userId: actor.actorId, tokenHash: 'a'.repeat(64), issuedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 3600_000).toISOString() } }
const asset = { sha256: 'b'.repeat(64), path: `/assets/${'b'.repeat(64)}.png`, contentType: 'image/png' as const, bytes: 1234, width: 1024, height: 1024 }

describe.runIf(Boolean(url))('durable image jobs on PostgreSQL', () => {
  let pool: pg.Pool
  let schema: string
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
  const quote = async () => run(async db => persistImageQuote(db, await buildImageQuote(config, scope, actor, { intentId: randomUUID(), prompt: 'Abstract warm light', modelId, aspect: 'native' })))
  const create = async () => {
    const value = await quote()
    return run(db => createImageJob(db, scope, actor, value.quoteId, principal))
  }
  const claim = (id: string) => run(db => claimImageJob(db, scope, id))
  const balance = () => readImageCredits(pool, wallet)
  beforeAll(async () => {
    schema = `image_jobs_${randomUUID().replaceAll('-', '')}`
    const admin = new pg.Client({ connectionString: url })
    await admin.connect()
    await admin.query(`CREATE SCHEMA "${schema}"`)
    await admin.end()
    pool = new pg.Pool({ connectionString: url, max: 8, options: `-c search_path=${schema},pg_catalog -c statement_timeout=6000` })
    await pool.query('CREATE TABLE agency_clients(id uuid PRIMARY KEY); CREATE TABLE page_studio_sites(tenant_id text,client_id uuid,id uuid,PRIMARY KEY(tenant_id,client_id,id))')
    await pool.query('INSERT INTO agency_clients VALUES($1)', [scope.clientId])
    await pool.query('INSERT INTO page_studio_sites VALUES($1,$2,$3)', [scope.tenantId, scope.clientId, scope.siteId])
    for (const file of ['438_page_studio_image_credits.sql', '439_page_studio_image_quotes.sql', '440_page_studio_image_jobs.sql']) {
      await pool.query(readFileSync(new URL(`../../../server/database/migrations/${file}`, import.meta.url), 'utf8'))
    }
  })
  beforeEach(async () => {
    await pool.query('TRUNCATE page_studio_image_jobs,page_studio_image_job_events,page_studio_image_quotes,page_studio_image_credit_entries,page_studio_image_credit_reservations,page_studio_image_wallets CASCADE')
    await run(db => grantImageCredits(db, wallet, { entryId: 'test-grant', credits: 100, fingerprint: 'a'.repeat(64) }))
  })
  afterAll(async () => {
    if (pool) {
      await pool.query(`DROP SCHEMA "${schema}" CASCADE`)
      await pool.end()
    }
  })

  it('atomically reserves once and replays the same job after quote expiry', async () => {
    const q = await quote()
    const results = await Promise.all([1, 2].map(() => run(db => createImageJob(db, scope, actor, q.quoteId, principal))))
    expect(results[0]).toEqual(results[1])
    expect(results[0]).toMatchObject({ jobId: q.quoteId, state: 'queued', credits: 70 })
    expect(await balance()).toMatchObject({ balance: 100, reserved: 70, available: 30 })
    await pool.query('UPDATE page_studio_image_quotes SET expires_at=clock_timestamp()-INTERVAL \'1 second\'')
    expect(await run(db => createImageJob(db, scope, actor, q.quoteId, principal))).toEqual(results[0])
  })
  it('does not reserve an expired quote or allow a different actor to consume it', async () => {
    const q = await quote()
    await expect(run(db => createImageJob(db, scope, { ...actor, actorId: randomUUID() }, q.quoteId, principal))).rejects.toMatchObject({ statusCode: 404 })
    await pool.query('UPDATE page_studio_image_quotes SET expires_at=clock_timestamp()-INTERVAL \'1 second\'')
    await expect(run(db => createImageJob(db, scope, actor, q.quoteId, principal))).rejects.toMatchObject({ statusCode: 410 })
    expect(await balance()).toMatchObject({ reserved: 0 })
  })
  it('rolls back the reservation and outbox when final native authority fails', async () => {
    const q = await quote()
    await expect(run(async (db) => {
      await createImageJob(db, scope, actor, q.quoteId, principal)
      throw new Error('Revoked')
    })).rejects.toThrow('Revoked')
    expect(await balance()).toMatchObject({ reserved: 0 })
    expect((await pool.query('SELECT count(*)::int count FROM page_studio_image_jobs')).rows[0].count).toBe(0)
  })
  it('admits at most one of two competing generations', async () => {
    const outcomes = await Promise.allSettled([create(), create()])
    expect(outcomes.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(outcomes.find(result => result.status === 'rejected')).toMatchObject({ reason: { code: 'IMAGE_CREDITS_INSUFFICIENT' } })
    expect(await balance()).toMatchObject({ available: 30, reserved: 70 })
  })
  it('claims exactly once across concurrent delivery and never redispatches', async () => {
    const job = await create()
    const claims = await Promise.all([claim(job.jobId), claim(job.jobId)])
    expect(claims.filter(value => value.admitted)).toHaveLength(1)
    const admitted = claims.find(value => value.admitted)!
    expect(admitted).toMatchObject({ admitted: true, quote: { prompt: 'Abstract warm light', credits: 70 }, dispatchToken: expect.any(String) })
    expect(await claim(job.jobId)).toEqual({ admitted: false })
    expect(JSON.stringify(await readImageJob(pool, scope, job.jobId))).not.toContain('dispatchToken')
  })
  it('settles a saved output once, including after a lost completion response', async () => {
    const job = await create()
    const c = await claim(job.jobId)
    if (!c.admitted) throw new Error('Claim missing')
    const complete = () => run(db => completeImageJob(db, scope, job.jobId, c.dispatchToken, asset))
    const first = await complete()
    expect(first).toMatchObject({ state: 'succeeded', asset })
    expect(await complete()).toEqual(first)
    expect(await balance()).toMatchObject({ balance: 30, reserved: 0, available: 30 })
    expect((await pool.query('SELECT count(*)::int count FROM page_studio_image_credit_entries WHERE kind=\'settle\'')).rows[0].count).toBe(1)
    await expect(run(db => failImageJob(db, scope, job.jobId, c.dispatchToken, 'provider-rejected'))).rejects.toMatchObject({ statusCode: 409 })
  })
  it('retains uncertain reservations and later reconciles durable output without re-dispatch', async () => {
    const job = await create()
    const c = await claim(job.jobId)
    if (!c.admitted) throw new Error('Claim missing')
    await run(db => markImageJobUncertain(db, scope, job.jobId, c.dispatchToken))
    expect(await readImageJob(pool, scope, job.jobId)).toMatchObject({ state: 'reconciliation' })
    expect(await balance()).toMatchObject({ reserved: 70 })
    expect(await claim(job.jobId)).toEqual({ admitted: false })
    await run(db => completeImageJob(db, scope, job.jobId, c.dispatchToken, asset))
    expect(await balance()).toMatchObject({ balance: 30, reserved: 0 })
  })
  it('releases only confirmed failures, idempotently', async () => {
    const job = await create()
    const c = await claim(job.jobId)
    if (!c.admitted) throw new Error('Claim missing')
    for (let i = 0; i < 2; i++) await run(db => failImageJob(db, scope, job.jobId, c.dispatchToken, 'invalid-output'))
    expect(await balance()).toMatchObject({ balance: 100, reserved: 0 })
    expect(await claim(job.jobId)).toEqual({ admitted: false })
    await expect(run(db => completeImageJob(db, scope, job.jobId, c.dispatchToken, asset))).rejects.toMatchObject({ statusCode: 409 })
  })
  it('denies forged completion credentials, changed output and unowned paths', async () => {
    const job = await create()
    const c = await claim(job.jobId)
    if (!c.admitted) throw new Error('Claim missing')
    await expect(run(db => completeImageJob(db, scope, job.jobId, randomUUID(), asset))).rejects.toMatchObject({ statusCode: 403 })
    for (const invalid of [{ ...asset, path: 'https://attacker.test/a.png' }, { ...asset, path: '/assets/other.png' }, { ...asset, bytes: 11 * 1024 * 1024 }, { ...asset, width: 10000 }]) {
      await expect(run(db => completeImageJob(db, scope, job.jobId, c.dispatchToken, invalid))).rejects.toMatchObject({ statusCode: 400 })
    }
    await run(db => completeImageJob(db, scope, job.jobId, c.dispatchToken, asset))
    await expect(run(db => completeImageJob(db, scope, job.jobId, c.dispatchToken, { ...asset, bytes: 2345 }))).rejects.toMatchObject({ statusCode: 409 })
  })
  it('isolates job reads, callbacks and the saved library by full site scope', async () => {
    const job = await create()
    const c = await claim(job.jobId)
    if (!c.admitted) throw new Error('Claim missing')
    await run(db => completeImageJob(db, scope, job.jobId, c.dispatchToken, asset))
    expect((await readImageLibrary(pool, scope, {})).items).toHaveLength(1)
    for (const patch of [{ tenantId: 'other' }, { clientId: randomUUID(), businessId: randomUUID() }, { siteId: randomUUID() }, { environment: 'production' as const }]) {
      const other = { ...scope, ...patch }
      await expect(readImageJob(pool, other, job.jobId)).rejects.toMatchObject({ statusCode: 404 })
      await expect(run(db => completeImageJob(db, other, job.jobId, c.dispatchToken, asset))).rejects.toMatchObject({ statusCode: 404 })
      expect((await readImageLibrary(pool, other, {})).items).toEqual([])
    }
  })
  it('keeps a bounded SQL outbox with a retry delay and no provider inputs in delivery', async () => {
    const job = await create()
    expect(await run(db => takeImageDispatchBatch(db, scope, 20))).toEqual([{ jobId: job.jobId, scope }])
    expect(await run(db => takeImageDispatchBatch(db, scope, 20))).toEqual([])
    await pool.query('UPDATE page_studio_image_jobs SET next_delivery_at=clock_timestamp()-INTERVAL \'1 second\'')
    expect(await run(db => takeImageDispatchBatch(db, scope, 20))).toHaveLength(1)
    await claim(job.jobId)
    await pool.query('UPDATE page_studio_image_jobs SET next_delivery_at=clock_timestamp()-INTERVAL \'1 second\'')
    expect(await run(db => takeImageDispatchBatch(db, scope, 20))).toEqual([])
  })
  it('bounds simultaneous customer jobs even when the wallet has ample credit', async () => {
    await run(db => grantImageCredits(db, wallet, { entryId: 'extra', credits: 1000, fingerprint: 'b'.repeat(64) }))
    await Promise.all([create(), create(), create()])
    await expect(create()).rejects.toMatchObject({ code: 'IMAGE_JOBS_BUSY', statusCode: 429 })
    expect(await balance()).toMatchObject({ reserved: 210 })
  })
  it('releases a revoked queued job but never cancels a job already dispatched', async () => {
    const job = await create()
    await run(db => cancelQueuedImageJob(db, scope, job.jobId, 'authority-revoked'))
    expect(await claim(job.jobId)).toEqual({ admitted: false })
    expect(await balance()).toMatchObject({ reserved: 0, balance: 100 })
    const second = await create()
    await claim(second.jobId)
    await run(db => cancelQueuedImageJob(db, scope, second.jobId, 'authority-revoked'))
    expect(await balance()).toMatchObject({ reserved: 70 })
    expect(await readImageJob(pool, scope, second.jobId)).toMatchObject({ state: 'dispatched' })
  })
  it('releases expired queued work while retaining stale dispatched outcomes', async () => {
    const job = await create()
    await pool.query('UPDATE page_studio_image_jobs SET created_at=clock_timestamp()-INTERVAL \'11 minutes\'')
    expect(await claim(job.jobId)).toEqual({ admitted: false })
    expect(await readImageJob(pool, scope, job.jobId)).toMatchObject({ state: 'failed', failureCode: 'dispatch-expired' })
    expect(await balance()).toMatchObject({ reserved: 0 })
    const second = await create()
    await claim(second.jobId)
    await pool.query('UPDATE page_studio_image_jobs SET dispatched_at=clock_timestamp()-INTERVAL \'6 minutes\' WHERE job_id=$1', [second.jobId])
    expect(await run(db => recoverStaleImageJobs(db, scope))).toEqual([{ jobId: second.jobId, scope }])
    expect(await readImageJob(pool, scope, second.jobId)).toMatchObject({ state: 'reconciliation' })
    expect(await claim(second.jobId)).toEqual({ admitted: false })
    expect(await balance()).toMatchObject({ reserved: 70 })
  })
  it('keeps terminal events immutable and omits principals from customer history', async () => {
    const job = await create()
    const c = await claim(job.jobId)
    if (!c.admitted) throw new Error('Claim missing')
    await run(db => completeImageJob(db, scope, job.jobId, c.dispatchToken, asset))
    await expect(pool.query('UPDATE page_studio_image_job_events SET state=\'failed\' WHERE job_id=$1', [job.jobId])).rejects.toMatchObject({ code: '55000' })
    const library = await readImageLibrary(pool, scope, {})
    expect(JSON.stringify(library)).not.toContain('tokenHash')
    expect(JSON.stringify(library)).not.toContain(c.dispatchToken)
  })
})
