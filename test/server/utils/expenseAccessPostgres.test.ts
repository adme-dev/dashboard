/* eslint-disable @typescript-eslint/no-explicit-any, @stylistic/max-statements-per-line */
/** Actual fresh staff/expense policy SQL, confined to an explicitly disposable localhost database. */
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { assertExpenseOwnWritePermission, assertExpenseReferences, assertExpenseRowAccess, hasExpenseFinancePermission } from '../../../server/utils/expenseAccess'

const state = vi.hoisted(() => ({ pool: null as pg.Pool | null }))
vi.mock('~~/server/utils/db', () => ({ queryOneFresh: async (sql: string, params?: any[]) => (await state.pool!.query(sql, params)).rows[0] ?? null }))
const url = process.env.EXPENSE_ROW_PG_URL
const target = url ? new URL(url) : null
const allowed = !!target && ['127.0.0.1', 'localhost'].includes(target.hostname) && /^\/finance_expense_rows_[a-z0-9_]+$/.test(target.pathname)
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`
describe.skipIf(!allowed)('expense policy actual PostgreSQL boundary', () => {
  beforeAll(async () => {
    state.pool = new pg.Pool({ connectionString: url })
    await state.pool.query(`CREATE TYPE user_role AS ENUM ('owner', 'member', 'viewer', 'guest');
      CREATE TABLE custom_roles (id uuid PRIMARY KEY, slug text, is_system boolean, is_read_only boolean);
      CREATE TABLE team_members (id uuid PRIMARY KEY, user_role user_role, custom_role_id uuid, is_active boolean);
      CREATE TABLE role_permission_groups (role_id uuid, permission_group text);
      CREATE TABLE expenses (id uuid PRIMARY KEY, user_id uuid, status text, project_id uuid, client_id uuid, task_id uuid);
      CREATE TABLE projects (id uuid PRIMARY KEY, client_id uuid);
      CREATE TABLE tasks (id uuid PRIMARY KEY, project_id uuid)`)
    await state.pool.query(`INSERT INTO custom_roles VALUES ($1,'owner',TRUE,FALSE),($2,'readonly',FALSE,TRUE);
    `, [id(1), id(2)])
    await state.pool.query(`INSERT INTO team_members VALUES ($1,'owner',NULL,TRUE),($2,'owner',$3,TRUE),($4,'owner',NULL,FALSE),($5,'viewer',$6,TRUE)`, [id(10), id(11), id(2), id(12), id(13), id(1)])
    await state.pool.query(`INSERT INTO projects VALUES ($1,$2),($3,$4)`, [id(20), id(30), id(21), id(31)])
    await state.pool.query('INSERT INTO tasks VALUES ($1,$2)', [id(40), id(20)])
    await state.pool.query('INSERT INTO expenses VALUES ($1,$2,\'draft\',$3,$4,$5)', [id(50), id(10), id(20), id(30), id(40)])
  })
  afterAll(async () => { await state.pool?.end() })
  it('allows own entry for writable staff but no implicit company Finance from owner role', async () => {
    await expect(assertExpenseOwnWritePermission(id(10))).resolves.toBeUndefined()
    await expect(hasExpenseFinancePermission({} as any, id(10), true)).resolves.toBe(false)
    await state.pool!.query('INSERT INTO role_permission_groups VALUES ($1,\'FINANCE\')', [id(1)])
    await expect(hasExpenseFinancePermission({} as any, id(10), true)).resolves.toBe(true)
    await state.pool!.query('DELETE FROM role_permission_groups')
    await expect(hasExpenseFinancePermission({} as any, id(10), true)).resolves.toBe(false)
  })
  it('denies a current read-only role, inactive staff, viewer and missing member', async () => {
    for (const user of [id(11), id(12), id(13), id(99)]) {
      await expect(assertExpenseOwnWritePermission(user)).rejects.toMatchObject({ statusCode: 403 })
    }
  })
  it('checks row ownership separately from Finance', async () => {
    await expect(assertExpenseRowAccess(id(50), id(10), false)).resolves.toHaveProperty('id', id(50))
    await expect(assertExpenseRowAccess(id(50), id(11), false)).rejects.toMatchObject({ statusCode: 403 })
    await expect(assertExpenseRowAccess(id(50), id(11), true)).resolves.toHaveProperty('id', id(50))
  })
  it('requires coherent project/client/task links', async () => {
    await expect(assertExpenseReferences({ projectId: id(20), clientId: id(30), taskId: id(40) })).resolves.toBeUndefined()
    await expect(assertExpenseReferences({ projectId: id(20), clientId: id(31) })).rejects.toMatchObject({ statusCode: 403 })
    await expect(assertExpenseReferences({ projectId: id(21), clientId: id(31), taskId: id(40) })).rejects.toMatchObject({ statusCode: 403 })
  })
  it('fails closed with 503 when the fresh policy store is unavailable', async () => {
    await state.pool!.query('ALTER TABLE custom_roles RENAME TO custom_roles_unavailable')
    try {
      await expect(assertExpenseOwnWritePermission(id(10))).rejects.toMatchObject({ statusCode: 503 })
      await expect(hasExpenseFinancePermission({} as any, id(10))).rejects.toMatchObject({ statusCode: 503 })
    } finally {
      await state.pool!.query('ALTER TABLE custom_roles_unavailable RENAME TO custom_roles')
    }
  })
})
