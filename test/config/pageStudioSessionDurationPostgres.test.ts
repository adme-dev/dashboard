import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const databaseUrl = process.env.PAGE_STUDIO_SESSION_DURATION_DATABASE_TEST_URL

describe.runIf(Boolean(databaseUrl))('editing session duration migration on disposable PostgreSQL', () => {
  const schema = `session_duration_${randomUUID().replaceAll('-', '')}`
  const clientId = '20000000-0000-4000-8000-000000000001'
  const siteId = '50000000-0000-4000-8000-000000000001'
  let db: pg.Client
  let connected = false
  beforeAll(async () => {
    expect(['127.0.0.1', 'localhost']).toContain(new URL(databaseUrl!).hostname)
    db = new pg.Client({ connectionString: databaseUrl })
    await db.connect()
    connected = true
    await db.query(`CREATE SCHEMA "${schema}"`)
    await db.query(`SET search_path TO "${schema}", pg_catalog`)
    await db.query(`CREATE TABLE page_studio_sites (tenant_id TEXT, client_id UUID, id UUID,
      PRIMARY KEY (tenant_id, client_id, id))`)
    await db.query('INSERT INTO page_studio_sites VALUES ($1,$2,$3)', ['duration-test', clientId, siteId])
    await db.query(await readFile('server/database/migrations/403_page_studio_sessions.sql', 'utf8'))
    await insert(600, 'old_session_00000001')
    const migration = await readFile('server/database/migrations/436_page_studio_editing_session_duration.sql', 'utf8')
    await db.query(migration)
    await db.query(migration)
  })
  afterAll(async () => {
    if (!connected) return
    await db.query(`DROP SCHEMA "${schema}" CASCADE`)
    await db.end()
  })
  function insert(seconds: number, nonce = randomUUID()) {
    return db.query(`INSERT INTO page_studio_sessions
      (nonce,tenant_id,client_id,site_id,user_id,role,capabilities,issued_at,expires_at)
      VALUES ($1,'duration-test',$2,$3,'duration-user','agency','["workspace:preview"]',
        to_timestamp(1800000000),to_timestamp(1800000000 + $4))`, [nonce, clientId, siteId, seconds])
  }
  it('accepts four hours and rejects an extra second or a nonpositive lifetime', async () => {
    await expect(insert(14400)).resolves.toMatchObject({ rowCount: 1 })
    await expect(insert(14401)).rejects.toMatchObject({ code: '23514', constraint: 'page_studio_sessions_max_editing_lifetime' })
    await expect(insert(0)).rejects.toMatchObject({ code: '23514', constraint: 'page_studio_sessions_check' })
  })
  it('leaves previously issued session expiry unchanged after repeated migration', async () => {
    const result = await db.query(`SELECT EXTRACT(EPOCH FROM expires_at-issued_at)::int AS lifetime
      FROM page_studio_sessions WHERE nonce='old_session_00000001'`)
    expect(result.rows).toEqual([{ lifetime: 600 }])
  })
})
