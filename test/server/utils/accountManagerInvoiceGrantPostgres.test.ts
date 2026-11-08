/* eslint-disable @stylistic/max-statements-per-line */
import { readFileSync } from 'node:fs'
import pg from 'pg'
import { describe, it, expect } from 'vitest'

const url = process.env.FINANCE_ACCESS_PG_URL
const target = url ? new URL(url) : null
const allowed = !!target && ['127.0.0.1', 'localhost'].includes(target.hostname) && /^\/finance_access_test_[a-z0-9_]+$/.test(target.pathname)
describe.skipIf(!allowed)('explicit account manager invoice migration in PostgreSQL', () => {
  it('is idempotent and grants only scoped invoices to the system AM role', async () => {
    const db = new pg.Client({ connectionString: url })
    await db.connect()
    try {
      await db.query('BEGIN')
      await db.query(`CREATE TEMP TABLE custom_roles (id text, slug text, is_system boolean);
        CREATE TEMP TABLE role_permission_groups (role_id text, permission_group text, UNIQUE(role_id, permission_group));
        INSERT INTO custom_roles VALUES ('am','account_manager',true),('custom','account_manager',false),('media','media_buyer',true);
        INSERT INTO role_permission_groups VALUES ('am','CLIENTS'),('media','MEDIA_BUYING')`)
      const migration = readFileSync('server/database/migrations/504_account_manager_explicit_invoice_grant.sql', 'utf8')
      await db.query(migration)
      await db.query(migration)
      const rows = (await db.query('SELECT * FROM role_permission_groups ORDER BY role_id, permission_group')).rows
      expect(rows).toEqual([
        { role_id: 'am', permission_group: 'CLIENTS' },
        { role_id: 'am', permission_group: 'INVOICE_OWN_CLIENTS' },
        { role_id: 'media', permission_group: 'MEDIA_BUYING' }
      ])
    } finally { await db.query('ROLLBACK'); await db.end() }
  })
})
