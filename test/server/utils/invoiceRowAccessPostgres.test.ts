/* eslint-disable @typescript-eslint/no-explicit-any, @stylistic/max-statements-per-line */
/** Actual lock and row-policy SQL against an explicitly disposable localhost database. */
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { lockInvoiceForEdit, assertInvoiceReferences, assertInvoiceClientAssignment } from '../../../server/utils/invoiceRowAccess'

vi.mock('~~/server/utils/db', () => ({
  queryOneFresh: async (sql: string, params?: any[]) => (await pool.query(sql, params)).rows[0] ?? null,
  queryRows: async (sql: string, params?: any[]) => (await pool.query(sql, params)).rows
}))
vi.mock('~~/server/utils/clientScoping', () => ({ requireInvoiceAccess: async () => ({ user: { id: 'am' }, clientIds: ['client-a'] }) }))
vi.stubGlobal('defineEventHandler', (fn: any) => fn)
vi.stubGlobal('getRouterParam', () => 'own')
const readLineItems = (await import('../../../server/api/agency/invoices/[id]/line-items.get')).default
const url = process.env.INVOICE_ROW_PG_URL
const target = url ? new URL(url) : null
const allowed = !!target && ['127.0.0.1', 'localhost'].includes(target.hostname)
  && /^\/finance_invoice_rows_[a-z0-9_]+$/.test(target.pathname)
let pool: pg.Pool
const access = { user: { id: 'am' }, clientIds: ['client-a'] } as any

describe.skipIf(!allowed)('invoice row actual PostgreSQL boundary', () => {
  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: url })
    await pool.query(`CREATE TABLE invoices (id text PRIMARY KEY, client_id text, status text, created_by text, invoice_number text, project_id text);
      CREATE TABLE agency_clients (id text PRIMARY KEY, is_active boolean);
      CREATE TABLE client_team_assignments (client_id text, team_member_id text);
      CREATE TABLE projects (id text PRIMARY KEY, client_id text, name text);
      CREATE TABLE time_entries (id text PRIMARY KEY, project_id text, description text, date date, hours numeric);
      CREATE TABLE invoice_line_items (id text PRIMARY KEY, invoice_id text, description text, quantity numeric, unit_price numeric, item_type text, taxable boolean, time_entry_id text, project_id text, sort_order int, created_at timestamp)`)
  })
  afterAll(async () => { await pool?.end() })
  beforeEach(async () => {
    await pool.query(`TRUNCATE invoices,agency_clients,client_team_assignments,projects,time_entries,invoice_line_items;
      INSERT INTO agency_clients VALUES ('client-a',TRUE),('client-b',TRUE);
      INSERT INTO client_team_assignments VALUES ('client-a','am');
      INSERT INTO invoices (id,client_id,status,created_by) VALUES ('own','client-a','draft','am'),('other','client-a','draft','other'),('sent','client-a','sent','am'),('foreign','client-b','draft','am');
      INSERT INTO projects (id,client_id) VALUES ('project-a','client-a'),('project-b','client-b');
      INSERT INTO time_entries (id,project_id) VALUES ('time-a','project-a'),('time-b','project-b')`)
  })
  it('permits only own draft in current active assignment and Finance can access sent rows', async () => {
    await expect(lockInvoiceForEdit(pool, 'own', access)).resolves.toMatchObject({ id: 'own' })
    for (const id of ['other', 'sent', 'foreign']) {
      await expect(lockInvoiceForEdit(pool, id, access)).rejects.toMatchObject({ statusCode: 403 })
    }
    await expect(lockInvoiceForEdit(pool, 'sent', { ...access, clientIds: 'all' })).resolves.toMatchObject({ status: 'sent' })
    await pool.query('DELETE FROM client_team_assignments WHERE team_member_id=\'am\'')
    await expect(lockInvoiceForEdit(pool, 'own', access)).rejects.toMatchObject({ statusCode: 403 })
  })
  it('denies inactive assignments and paid Finance edits', async () => {
    await pool.query('UPDATE agency_clients SET is_active=FALSE WHERE id=\'client-a\'')
    await expect(lockInvoiceForEdit(pool, 'own', access)).rejects.toMatchObject({ statusCode: 403 })
    await pool.query('UPDATE invoices SET status=\'paid\' WHERE id=\'own\'')
    await expect(lockInvoiceForEdit(pool, 'own', { ...access, clientIds: 'all' })).rejects.toMatchObject({ statusCode: 400 })
  })
  it('holds parent lock until commit so status cannot change during child mutation', async () => {
    const writer = await pool.connect()
    const contender = await pool.connect()
    try {
      await writer.query('BEGIN')
      await lockInvoiceForEdit(writer, 'own', access)
      await contender.query('BEGIN')
      await expect(contender.query('SELECT id FROM invoices WHERE id=\'own\' FOR UPDATE NOWAIT')).rejects.toMatchObject({ code: '55P03' })
    } finally {
      await writer.query('ROLLBACK')
      await contender.query('ROLLBACK')
      writer.release()
      contender.release()
    }
  })
  it('rechecks and share-locks live assignment for a scoped creator', async () => {
    const creator = await pool.connect()
    const contender = await pool.connect()
    try {
      await creator.query('BEGIN')
      await assertInvoiceClientAssignment(creator, 'client-a', 'am')
      await contender.query('BEGIN')
      await expect(contender.query('SELECT client_id FROM client_team_assignments WHERE team_member_id=\'am\' FOR UPDATE NOWAIT')).rejects.toMatchObject({ code: '55P03' })
    } finally {
      await creator.query('ROLLBACK')
      await contender.query('ROLLBACK')
      creator.release()
      contender.release()
    }
    await pool.query('DELETE FROM client_team_assignments WHERE team_member_id=\'am\'')
    await expect(assertInvoiceClientAssignment(pool, 'client-a', 'am')).rejects.toMatchObject({ statusCode: 403 })
  })
  it('returns no foreign-client IDs or time-entry details from a legacy invoice line', async () => {
    await pool.query('UPDATE projects SET name=id; UPDATE time_entries SET description=id, hours=3, date=\'2026-11-07\'')
    await pool.query(`INSERT INTO invoice_line_items (id,invoice_id,description,quantity,unit_price,item_type,taxable,time_entry_id,project_id,sort_order)
      VALUES ('foreign-line','own','Billed work',1,10,'service',TRUE,'time-b','project-b',0),
      ('own-line','own','Other billed work',1,10,'service',TRUE,'time-a','project-a',1)`)
    const result = await readLineItems({} as any)
    expect(result.lineItems[0]).toMatchObject({ timeEntryId: null, timeEntryDescription: null, timeEntryHours: null, projectId: null, projectName: null })
    expect(result.lineItems[1]).toMatchObject({ timeEntryId: 'time-a', timeEntryDescription: 'time-a', timeEntryHours: 3, projectId: 'project-a', projectName: 'project-a' })
  })
  it('checks linked project and time entry client using actual joins', async () => {
    await expect(assertInvoiceReferences(pool, 'client-a', { projectId: 'project-a', timeEntryId: 'time-a' })).resolves.toBeUndefined()
    await expect(assertInvoiceReferences(pool, 'client-a', { projectId: 'project-b' })).rejects.toMatchObject({ statusCode: 403 })
    await expect(assertInvoiceReferences(pool, 'client-a', { timeEntryId: 'time-b' })).rejects.toMatchObject({ statusCode: 403 })
  })
})
