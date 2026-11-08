/** Actual finance-authority SQL, isolated to an explicitly named disposable localhost database. */
import type { H3Event } from 'h3'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { assertFinancePermission, assertPermissionGrant } from '~~/server/utils/financeAccess'

const state = vi.hoisted(() => ({ pool: null as pg.Pool | null, schema: '' }))
vi.mock('~~/server/utils/db', () => ({
  queryOneFresh: async (sql: string, args?: unknown[]) => {
    const db = await state.pool!.connect()
    try {
      await db.query(`SET search_path TO ${state.schema}`)
      return (await db.query(sql, args)).rows[0] ?? null
    } finally { db.release() }
  }
}))
const url = process.env.FINANCE_ACCESS_PG_URL
const target = url ? new URL(url) : null
const allowed = !!target && ['127.0.0.1', 'localhost'].includes(target.hostname)
  && /^\/finance_access_test_[a-z0-9_]+$/.test(target.pathname)
const roles = ['owner', 'admin', 'marketing', 'member'] as const
const roleId = (i: number) => `10000000-0000-4000-8000-${String(i).padStart(12, '0')}`
const memberId = (i: number) => `20000000-0000-4000-8000-${String(i).padStart(12, '0')}`
const event = () => ({ context: { permissionGroups: ['FINANCE'], user: { role: 'owner' }, godMode: { enabled: true } } }) as unknown as H3Event

describe.skipIf(!allowed)('finance permission actual PostgreSQL boundary', () => {
  beforeAll(async () => {
    state.pool = new pg.Pool({ connectionString: url, max: 3 })
    state.schema = `finance_access_${Date.now()}`
    await state.pool.query(`CREATE SCHEMA ${state.schema}`)
    await state.pool.query(`CREATE TYPE ${state.schema}.user_role AS ENUM ('owner','admin','marketing','member','viewer','guest');
      CREATE TABLE ${state.schema}.team_members (id uuid PRIMARY KEY, user_role ${state.schema}.user_role, custom_role_id uuid, is_active boolean);
      CREATE TABLE ${state.schema}.custom_roles (id uuid PRIMARY KEY, slug text UNIQUE, is_system boolean, is_read_only boolean DEFAULT FALSE);
      CREATE TABLE ${state.schema}.role_permission_groups (role_id uuid, permission_group text, UNIQUE(role_id,permission_group))`)
  })
  afterAll(async () => {
    if (state.pool) {
      await state.pool.query(`DROP SCHEMA ${state.schema} CASCADE`)
      await state.pool.end()
    }
  })
  beforeEach(async () => {
    await state.pool!.query(`TRUNCATE ${state.schema}.team_members,${state.schema}.custom_roles,${state.schema}.role_permission_groups`)
    for (let i = 0; i < roles.length; i++) {
      await state.pool!.query(`INSERT INTO ${state.schema}.custom_roles (id,slug,is_system) VALUES ($1,$2,TRUE)`, [roleId(i), roles[i]])
      await state.pool!.query(`INSERT INTO ${state.schema}.team_members VALUES ($1,$2,NULL,TRUE)`, [memberId(i), roles[i]])
    }
  })
  it.each(roles)('denies %s without FINANCE and allows it only after the explicit grant', async (role) => {
    const i = roles.indexOf(role)
    await expect(assertFinancePermission(event(), memberId(i))).rejects.toMatchObject({ statusCode: 403 })
    await state.pool!.query(`INSERT INTO ${state.schema}.role_permission_groups VALUES ($1,'FINANCE')`, [roleId(i)])
    await expect(assertFinancePermission(event(), memberId(i))).resolves.toBeUndefined()
  })
  it('uses the exact assigned custom role and never falls back to owner when it is narrower or missing', async () => {
    await state.pool!.query(`INSERT INTO ${state.schema}.role_permission_groups VALUES ($1,'FINANCE')`, [roleId(0)])
    await state.pool!.query(`INSERT INTO ${state.schema}.custom_roles (id,slug,is_system) VALUES ($1,'narrow',FALSE)`, [roleId(10)])
    await state.pool!.query(`UPDATE ${state.schema}.team_members SET custom_role_id=$1 WHERE id=$2`, [roleId(10), memberId(0)])
    await expect(assertFinancePermission(event(), memberId(0))).rejects.toMatchObject({ statusCode: 403 })
    await state.pool!.query(`INSERT INTO ${state.schema}.role_permission_groups VALUES ($1,'FINANCE')`, [roleId(10)])
    await expect(assertFinancePermission(event(), memberId(0))).resolves.toBeUndefined()
    await state.pool!.query(`DELETE FROM ${state.schema}.custom_roles WHERE id=$1`, [roleId(10)])
    await expect(assertFinancePermission(event(), memberId(0))).rejects.toMatchObject({ statusCode: 403 })
  })
  it('rejects revoked grants immediately on the next request', async () => {
    await state.pool!.query(`INSERT INTO ${state.schema}.role_permission_groups VALUES ($1,'FINANCE')`, [roleId(0)])
    await expect(assertFinancePermission(event(), memberId(0))).resolves.toBeUndefined()
    await state.pool!.query(`DELETE FROM ${state.schema}.role_permission_groups WHERE role_id=$1`, [roleId(0)])
    await expect(assertFinancePermission(event(), memberId(0))).rejects.toMatchObject({ statusCode: 403 })
  })
  it('denies inactive and missing members despite role FINANCE grants', async () => {
    await state.pool!.query(`INSERT INTO ${state.schema}.role_permission_groups VALUES ($1,'FINANCE')`, [roleId(0)])
    await state.pool!.query(`UPDATE ${state.schema}.team_members SET is_active=FALSE WHERE id=$1`, [memberId(0)])
    await expect(assertFinancePermission(event(), memberId(0))).rejects.toMatchObject({ statusCode: 403 })
    await expect(assertFinancePermission(event(), memberId(99))).rejects.toMatchObject({ statusCode: 403 })
  })
  it('does not use a non-system slug match as a default role', async () => {
    await state.pool!.query(`UPDATE ${state.schema}.custom_roles SET is_system=FALSE WHERE id=$1`, [roleId(0)])
    await state.pool!.query(`INSERT INTO ${state.schema}.role_permission_groups VALUES ($1,'FINANCE')`, [roleId(0)])
    await expect(assertFinancePermission(event(), memberId(0))).rejects.toMatchObject({ statusCode: 403 })
  })
  it('allows explicit FINANCE reads but rejects writes for a current read-only role', async () => {
    await state.pool!.query(`INSERT INTO ${state.schema}.role_permission_groups VALUES ($1,'FINANCE')`, [roleId(0)])
    await state.pool!.query(`UPDATE ${state.schema}.custom_roles SET is_read_only=TRUE WHERE id=$1`, [roleId(0)])
    await expect(assertFinancePermission(event(), memberId(0))).resolves.toBeUndefined()
    await expect(assertFinancePermission(event(), memberId(0), true)).rejects.toMatchObject({ statusCode: 403 })
  })
  it('rejects writes for a legacy owner assigned an explicitly read-only custom FINANCE role', async () => {
    await state.pool!.query(`INSERT INTO ${state.schema}.custom_roles VALUES ($1,'readonly-finance',FALSE,TRUE)`, [roleId(10)])
    await state.pool!.query(`INSERT INTO ${state.schema}.role_permission_groups VALUES ($1,'FINANCE')`, [roleId(10)])
    await state.pool!.query(`UPDATE ${state.schema}.team_members SET custom_role_id=$1 WHERE id=$2`, [roleId(10), memberId(0)])
    await expect(assertFinancePermission(event(), memberId(0))).resolves.toBeUndefined()
    await expect(assertFinancePermission(event(), memberId(0), true)).rejects.toMatchObject({ statusCode: 403 })
  })
  it.each(['viewer', 'guest'])('rejects writes for a %s member even with a writable custom FINANCE role', async (role) => {
    await state.pool!.query(`INSERT INTO ${state.schema}.role_permission_groups VALUES ($1,'FINANCE')`, [roleId(0)])
    await state.pool!.query(`UPDATE ${state.schema}.team_members SET user_role=$1,custom_role_id=$2 WHERE id=$3`, [role, roleId(0), memberId(0)])
    await expect(assertFinancePermission(event(), memberId(0))).resolves.toBeUndefined()
    await expect(assertFinancePermission(event(), memberId(0), true)).rejects.toMatchObject({ statusCode: 403 })
  })
  it('allows an explicitly granted writable finance role to write', async () => {
    await state.pool!.query(`INSERT INTO ${state.schema}.role_permission_groups VALUES ($1,'FINANCE')`, [roleId(0)])
    await expect(assertFinancePermission(event(), memberId(0), true)).resolves.toBeUndefined()
  })
  it.each(['CLIENTS', 'INVOICE_OWN_CLIENTS', 'ADMIN'] as const)('resolves and revokes exact %s grants without supplying company FINANCE', async (group) => {
    await state.pool!.query(`INSERT INTO ${state.schema}.role_permission_groups VALUES ($1,$2)`, [roleId(2), group])
    await expect(assertPermissionGrant(event(), memberId(2), group)).resolves.toBeUndefined()
    await expect(assertFinancePermission(event(), memberId(2))).rejects.toMatchObject({ statusCode: 403 })
    await state.pool!.query(`DELETE FROM ${state.schema}.role_permission_groups WHERE role_id=$1`, [roleId(2)])
    await expect(assertPermissionGrant(event(), memberId(2), group)).rejects.toMatchObject({ statusCode: 403 })
  })
  it('fails closed with 503 if the authority schema becomes unavailable', async () => {
    await state.pool!.query(`ALTER TABLE ${state.schema}.role_permission_groups RENAME TO unavailable_permission_groups`)
    try {
      await expect(assertFinancePermission(event(), memberId(0))).rejects.toMatchObject({ statusCode: 503 })
    } finally {
      await state.pool!.query(`ALTER TABLE ${state.schema}.unavailable_permission_groups RENAME TO role_permission_groups`)
    }
  })
})
