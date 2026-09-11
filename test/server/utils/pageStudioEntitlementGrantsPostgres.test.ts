import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { grantPageStudioEntitlement } from '~~/server/utils/pageStudio/entitlementGrants'
import type { RunPageStudioTransaction } from '~~/server/utils/pageStudio/sites'

const databaseUrl = process.env.PAGE_STUDIO_GRANT_DATABASE_TEST_URL
const schema = `page_studio_grants_${randomUUID().replaceAll('-', '')}`
const actorId = '30000000-0000-4000-8000-000000000901'
const tenantId = 'tenant-grant-test'
const body = {
  requestId: '60000000-0000-4000-8000-000000000901',
  clientId: '20000000-0000-4000-8000-000000000901',
  planKey: 'agency-review', status: 'trial', effectiveFrom: '2026-09-10T00:00:00Z', effectiveUntil: '2026-10-10T00:00:00Z',
  portalCreationEnabled: false, allowedModules: ['business-content', 'bookings', 'enquiries'],
  siteLimit: 1, pagesPerSiteLimit: 15, storageBytesLimit: 1073741824, domainLimit: 0,
  aiOperationLimit: 100, buildLimit: 30, trafficBytesLimit: 10737418240, reason: 'Internal build period'
}
const now = new Date('2026-09-10T01:00:00Z')

describe.runIf(Boolean(databaseUrl))('access grants on disposable PostgreSQL', () => {
  let pool: pg.Pool
  let initialized = false
  const run: RunPageStudioTransaction = async (callback) => {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(`SET LOCAL search_path TO "${schema}", pg_catalog`)
      const result = await callback({ query: async <T>(sql: string, values?: unknown[]) => ({ rows: (await client.query(sql, values)).rows as T[] }) })
      await client.query('COMMIT')
      return result
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally { client.release() }
  }
  const grant = (change: Record<string, unknown> = {}, tenant = tenantId) => grantPageStudioEntitlement({ actorId, tenantId: tenant, body: { ...body, ...change } }, run, now)
  beforeAll(async () => {
    expect(['localhost', '127.0.0.1']).toContain(new URL(databaseUrl!).hostname)
    pool = new pg.Pool({ connectionString: databaseUrl, max: 3 })
    await pool.query(`CREATE SCHEMA "${schema}"`)
    initialized = true
    const control = readFileSync('server/database/migrations/402_page_studio_control_plane.sql', 'utf8')
    const billing = readFileSync('server/database/migrations/416_page_studio_access_audit.sql', 'utf8')
    await run(async (db) => {
      await db.query('CREATE TABLE agency_clients (id UUID PRIMARY KEY, is_active BOOLEAN NOT NULL); CREATE TABLE team_members (id UUID PRIMARY KEY)')
      await db.query(control.slice(control.indexOf('CREATE TABLE IF NOT EXISTS page_studio_entitlements'), control.indexOf('CREATE TABLE IF NOT EXISTS page_studio_sites')))
      await db.query(billing.replace(/^BEGIN;|^COMMIT;/gm, ''))
      await db.query('INSERT INTO agency_clients VALUES ($1, TRUE)', [body.clientId])
      await db.query('INSERT INTO team_members VALUES ($1)', [actorId])
    })
  })
  beforeEach(async () => {
    await run(async (db) => {
      await db.query('TRUNCATE page_studio_entitlements, billing_entitlement_audit')
    })
  })
  afterAll(async () => {
    try {
      if (initialized) await pool.query(`DROP SCHEMA "${schema}" CASCADE`)
    } finally { await pool?.end() }
  })

  it('serializes matching concurrent grants into one entitlement and one audit', async () => {
    const [first, second] = await Promise.all([grant(), grant()])
    expect(first.entitlement.id).toBe(second.entitlement.id)
    expect([first.replayed, second.replayed].sort()).toEqual([false, true])
    await run(async (db) => {
      expect((await db.query('SELECT * FROM page_studio_entitlements')).rows).toHaveLength(1)
      const audits = (await db.query<{ metadata: { request: Record<string, unknown> } }>('SELECT * FROM billing_entitlement_audit')).rows
      expect(audits).toHaveLength(1)
      expect(audits[0]!.metadata.request).toMatchObject({ pagesPerSiteLimit: 15, allowedModules: ['bookings', 'business-content', 'enquiries'] })
    })
  })

  it('rejects a competing new request without replacing the winner', async () => {
    const results = await Promise.allSettled([grant(), grant({ requestId: randomUUID(), siteLimit: 2 })])
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.find(result => result.status === 'rejected')).toMatchObject({ reason: { statusCode: 409 } })
    await run(async (db) => {
      expect((await db.query('SELECT * FROM billing_entitlement_audit')).rows).toHaveLength(1)
    })
  })

  it('does not reuse another tenant’s receipt with the same request key', async () => {
    const first = await grant()
    const second = await grant({}, 'other-authorized-tenant')
    expect(second.entitlement.id).not.toBe(first.entitlement.id)
    expect(second.entitlement.tenantId).toBe('other-authorized-tenant')
    expect(second.replayed).toBe(false)
  })

  it('prevents committed access evidence from being updated or deleted', async () => {
    await grant()
    await expect(run(db => db.query('UPDATE billing_entitlement_audit SET action = $1', ['changed']))).rejects.toThrow('append-only')
    await expect(run(db => db.query('DELETE FROM billing_entitlement_audit'))).rejects.toThrow('append-only')
    await run(async (db) => {
      expect((await db.query('SELECT * FROM billing_entitlement_audit WHERE action = $1', ['grant_created'])).rows).toHaveLength(1)
    })
  })

  it('can reapply the migration without changing an existing grant or its audit', async () => {
    const first = await grant()
    const migration = readFileSync('server/database/migrations/416_page_studio_access_audit.sql', 'utf8').replace(/^BEGIN;|^COMMIT;/gm, '')
    await run(db => db.query(migration))
    expect(await grant()).toEqual({ entitlement: first.entitlement, replayed: true })
    await expect(run(db => db.query('DELETE FROM billing_entitlement_audit'))).rejects.toThrow('append-only')
  })

  it('rolls back the entitlement when audit insertion fails', async () => {
    await run(async (db) => {
      await db.query(`CREATE FUNCTION fail_grant_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Test audit failure'; END; $$;
        CREATE TRIGGER fail_grant_audit BEFORE INSERT ON billing_entitlement_audit FOR EACH ROW EXECUTE FUNCTION fail_grant_audit()`)
    })
    try {
      await expect(grant()).rejects.toThrow('Test audit failure')
      await run(async (db) => {
        expect((await db.query('SELECT * FROM page_studio_entitlements')).rows).toHaveLength(0)
      })
    } finally {
      await run(async (db) => {
        await db.query('DROP TRIGGER fail_grant_audit ON billing_entitlement_audit; DROP FUNCTION fail_grant_audit()')
      })
    }
  })
})
