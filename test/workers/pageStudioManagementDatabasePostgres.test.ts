import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { withManagementTransaction } from '../../workers/page-studio-management/src/database'

const databaseUrl = process.env.PAGE_STUDIO_MANAGEMENT_DATABASE_TEST_URL
const table = `management_latency_${randomUUID().replaceAll('-', '')}`

describe.runIf(Boolean(databaseUrl))('management transaction on disposable PostgreSQL', () => {
  let admin: pg.Client
  beforeAll(async () => {
    expect(['localhost', '127.0.0.1']).toContain(new URL(databaseUrl!).hostname)
    admin = new pg.Client({ connectionString: databaseUrl, connectionTimeoutMillis: 3000 })
    await admin.connect()
    await admin.query(`CREATE TABLE public.${table} (id text PRIMARY KEY)`)
  })
  afterAll(async () => {
    if (admin) {
      await admin.query(`DROP TABLE IF EXISTS public.${table}`)
      await admin.end()
    }
  })

  it('applies every transaction-local setting before parameterized work', async () => {
    const settings = await withManagementTransaction(databaseUrl!, async (db) => {
      const result = await db.query(`SELECT current_setting('search_path') AS path,
        current_setting('statement_timeout') AS statement,
        current_setting('lock_timeout') AS lock,
        current_setting('idle_in_transaction_session_timeout') AS idle,
        $1::text AS value`, ['literal\'; SELECT 1; --'])
      return result.rows[0]
    })
    expect(settings).toEqual({ path: 'public, pg_catalog', statement: '10s', lock: '2s', idle: '15s', value: 'literal\'; SELECT 1; --' })
  })

  it('commits successful work so a separate connection can read it', async () => {
    await withManagementTransaction(databaseUrl!, db => db.query(`INSERT INTO ${table} VALUES ($1)`, ['committed']))
    expect((await admin.query(`SELECT id FROM public.${table} WHERE id=$1`, ['committed'])).rows).toEqual([{ id: 'committed' }])
  })

  it('rolls back all writes when a later parameterized statement fails', async () => {
    await expect(withManagementTransaction(databaseUrl!, async (db) => {
      await db.query(`INSERT INTO ${table} VALUES ($1)`, ['rolled-back'])
      await db.query(`INSERT INTO ${table} VALUES ($1)`, ['rolled-back'])
    })).rejects.toMatchObject({ code: '23505' })
    expect((await admin.query(`SELECT id FROM public.${table} WHERE id=$1`, ['rolled-back'])).rows).toEqual([])
  })

  it('rolls back writes when the callback fails outside a query', async () => {
    const failure = new Error('synthetic callback failure')
    await expect(withManagementTransaction(databaseUrl!, async (db) => {
      await db.query(`INSERT INTO ${table} VALUES ($1)`, ['callback-failed'])
      throw failure
    })).rejects.toBe(failure)
    expect((await admin.query(`SELECT id FROM public.${table} WHERE id=$1`, ['callback-failed'])).rows).toEqual([])
  })
})
