import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import pg from 'pg'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const databaseUrl = process.env.PAGE_STUDIO_CMS_DATABASE_TEST_URL
if (databaseUrl) {
  const url = new URL(databaseUrl)
  if (url.hostname !== '127.0.0.1' || !/^\/studio_cms_[a-z0-9_]+$/.test(url.pathname) || url.search)
    throw new Error('Disposable localhost studio_cms database required')
}
describe.runIf(Boolean(databaseUrl))('sole CMS authoring scope on real PostgreSQL', () => {
  let observer: pg.Client, schema: string
  const connections: pg.Client[] = []
  async function connect() {
    const db = new pg.Client({ connectionString: databaseUrl })
    await db.connect()
    connections.push(db)
    await db.query(`SET search_path TO "${schema}", pg_catalog`)
    await db.query('SET statement_timeout=\'5s\'')
    return db
  }
  const migrate = () => observer.query(readFileSync(new URL('../../../server/database/migrations/425_page_studio_cms_authoring_scope.sql', import.meta.url), 'utf8'))
  const insert = (db: pg.Client, environment: string, state: string) => db.query(
    'INSERT INTO page_studio_cms_scopes VALUES($1,\'tenant\',\'client\',\'site\',$2,$3)', [randomUUID(), environment, state])
  beforeEach(async () => {
    schema = `authoring_${randomUUID().replaceAll('-', '')}`
    observer = await connect()
    await observer.query(`CREATE SCHEMA "${schema}"`)
    await observer.query('CREATE TABLE page_studio_cms_scopes(scope_key TEXT PRIMARY KEY,tenant_id TEXT,client_id TEXT,site_id TEXT,environment TEXT,state TEXT)')
  })
  afterEach(async () => {
    await Promise.all(connections.filter(db => db !== observer).map(db => db.end()))
    await observer.query(`DROP SCHEMA "${schema}" CASCADE`)
    await observer.end()
    connections.length = 0
  })
  it.each(['freezing', 'importing', 'managed', 'blocked'])('reserves a site while %s and permits legacy rows', async (state) => {
    await migrate()
    await insert(observer, 'staging', state)
    await insert(observer, 'preview', 'legacy')
    await expect(insert(observer, 'production', 'freezing')).rejects.toMatchObject({ code: '23505', constraint: 'page_studio_cms_one_authoring_scope' })
    expect((await observer.query('SELECT count(*)::int AS count FROM page_studio_cms_scopes')).rows[0].count).toBe(2)
  })
  it.each([['staging', 'production'], ['production', 'staging'], ['preview', 'staging']])('serializes %s before %s', async (first, second) => {
    await migrate()
    const left = await connect(), right = await connect()
    await left.query('BEGIN')
    await insert(left, first, 'freezing')
    const pending = insert(right, second, 'freezing')
    const rejection = expect(pending).rejects.toMatchObject({ code: '23505', constraint: 'page_studio_cms_one_authoring_scope' })
    await left.query('COMMIT')
    await rejection
    expect((await observer.query('SELECT environment FROM page_studio_cms_scopes')).rows).toEqual([{ environment: first }])
  })
  it('allows the second adoption when the first transaction rolls back', async () => {
    await migrate()
    const left = await connect(), right = await connect()
    await left.query('BEGIN')
    await insert(left, 'staging', 'freezing')
    const pending = insert(right, 'production', 'freezing')
    await left.query('ROLLBACK')
    await pending
    expect((await observer.query('SELECT environment FROM page_studio_cms_scopes')).rows).toEqual([{ environment: 'production' }])
  })
  it('fails migration on conflicting existing scopes without changing data', async () => {
    await insert(observer, 'staging', 'managed')
    await insert(observer, 'production', 'freezing')
    const before = (await observer.query('SELECT * FROM page_studio_cms_scopes ORDER BY environment')).rows
    await expect(migrate()).rejects.toMatchObject({ code: '23505' })
    expect((await observer.query('SELECT * FROM page_studio_cms_scopes ORDER BY environment')).rows).toEqual(before)
  })
  it('also fences a legacy row becoming pending', async () => {
    await migrate()
    await insert(observer, 'staging', 'managed')
    await insert(observer, 'production', 'legacy')
    await expect(observer.query('UPDATE page_studio_cms_scopes SET state=\'freezing\' WHERE environment=\'production\'')).rejects.toMatchObject({ code: '23505' })
  })
})
