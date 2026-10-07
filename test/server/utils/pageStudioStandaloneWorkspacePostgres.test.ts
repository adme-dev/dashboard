import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { authorizeStandaloneSite } from '~~/server/utils/pageStudio/standaloneWorkspace'

const url = process.env.PAGE_STUDIO_WORKSPACE_TEST_DATABASE_URL
const input = { siteId: randomUUID(), clientId: randomUUID(), userId: randomUUID(), tokenHash: 'a'.repeat(64) }
const entitlementId = randomUUID()
describe.runIf(Boolean(url))('standalone site authority on disposable PostgreSQL', () => {
  let db: pg.Client
  let connected = false
  const schema = `standalone_workspace_${randomUUID().replaceAll('-', '')}`
  const deps = { query: async (sql: string, params: unknown[]) => (await db.query(sql, params)).rows[0] ?? null }
  beforeAll(async () => {
    expect(['localhost', '127.0.0.1']).toContain(new URL(url!).hostname)
    db = new pg.Client({ connectionString: url })
    await db.connect()
    connected = true
    await db.query(`CREATE SCHEMA "${schema}"; SET search_path TO "${schema}", pg_catalog;
      CREATE TABLE agency_clients(id uuid PRIMARY KEY,is_active boolean);
      CREATE TABLE client_users(id uuid PRIMARY KEY,client_id uuid,status text);
      CREATE TABLE client_sessions(client_user_id uuid,token_hash text,expires_at timestamptz);
      CREATE TABLE page_studio_sites(id uuid PRIMARY KEY,tenant_id text,client_id uuid,entitlement_id uuid,name text,status text);
      CREATE TABLE page_studio_entitlements(id uuid PRIMARY KEY,tenant_id text,client_id uuid,status text,effective_from timestamptz,effective_until timestamptz);
      CREATE TABLE page_studio_site_memberships(tenant_id text,client_id uuid,site_id uuid,user_id uuid,role text);`)
    await db.query('INSERT INTO agency_clients VALUES($1,TRUE)', [input.clientId])
    await db.query('INSERT INTO client_users VALUES($1,$2,\'active\')', [input.userId, input.clientId])
    await db.query('INSERT INTO client_sessions VALUES($1,$2,clock_timestamp()+interval \'1 hour\')', [input.userId, input.tokenHash])
    await db.query('INSERT INTO page_studio_sites VALUES($1,\'tenant\',$2,$3,\'Demo\',\'active\')', [input.siteId, input.clientId, entitlementId])
    await db.query('INSERT INTO page_studio_entitlements VALUES($1,\'tenant\',$2,\'active\',clock_timestamp()-interval \'1 hour\',NULL)', [entitlementId, input.clientId])
    await db.query('INSERT INTO page_studio_site_memberships VALUES(\'tenant\',$1,$2,$3,\'editor\')', [input.clientId, input.siteId, input.userId])
  })
  beforeEach(async () => {
    await db.query('BEGIN')
  })
  afterEach(async () => {
    await db.query('ROLLBACK')
  })
  afterAll(async () => {
    if (!connected) return
    try {
      await db.query(`DROP SCHEMA "${schema}" CASCADE`)
    } finally {
      await db.end()
    }
  })
  it('accepts the exact assigned customer session, including viewer access', async () => {
    await expect(authorizeStandaloneSite(input, deps)).resolves.toMatchObject({ role: 'editor', tenant_id: 'tenant' })
    await db.query('UPDATE page_studio_site_memberships SET role=\'viewer\'')
    await expect(authorizeStandaloneSite(input, deps)).resolves.toMatchObject({ role: 'viewer' })
  })
  it.each(['clientId', 'siteId', 'userId', 'tokenHash'] as const)('denies a foreign %s', async (field) => {
    await expect(authorizeStandaloneSite({ ...input, [field]: field === 'tokenHash' ? 'b'.repeat(64) : randomUUID() }, deps)).rejects.toMatchObject({ statusCode: 404 })
  })
  it.each([
    'DELETE FROM client_sessions',
    'UPDATE client_sessions SET expires_at=clock_timestamp()-interval \'1 second\'',
    'UPDATE client_users SET status=\'suspended\'',
    'UPDATE agency_clients SET is_active=FALSE',
    'UPDATE page_studio_sites SET status=\'archived\'',
    'UPDATE page_studio_entitlements SET effective_until=clock_timestamp()-interval \'1 second\'',
    'UPDATE page_studio_entitlements SET effective_from=clock_timestamp()+interval \'1 hour\'',
    'UPDATE page_studio_entitlements SET status=\'suspended\'',
    'UPDATE page_studio_entitlements SET tenant_id=\'foreign\'',
    'UPDATE page_studio_site_memberships SET tenant_id=\'foreign\'',
    'UPDATE page_studio_site_memberships SET client_id=gen_random_uuid()',
    'UPDATE page_studio_site_memberships SET site_id=gen_random_uuid()',
    'UPDATE page_studio_site_memberships SET user_id=gen_random_uuid()',
    'DELETE FROM page_studio_site_memberships'
  ])('denies revoked or mismatched authority: %s', async (sql) => {
    await db.query(sql)
    await expect(authorizeStandaloneSite(input, deps)).rejects.toMatchObject({ statusCode: 404 })
  })
})
