import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { resolveUserPlatformAgentAuthority } from '~~/server/utils/ai/platformAgentAuthority'

const state = vi.hoisted(() => ({ pool: null as pg.Pool | null, actorId: '' }))
vi.mock('~~/server/utils/auth', () => ({ requireAuth: async () => ({ id: state.actorId, role: 'owner', permissionGroups: ['ADMIN', 'FINANCE'] }) }))
vi.mock('~~/server/utils/session', () => ({ getSelectedTenant: vi.fn() }))
vi.mock('~~/server/utils/db', () => ({
  queryRows: vi.fn(() => { throw new Error('User path must not read cached clients') }),
  queryRowsFresh: async (sql: string, params?: unknown[]) => (await state.pool!.query(sql, params)).rows,
  queryOneFresh: async (sql: string, params?: unknown[]) => (await state.pool!.query(sql, params)).rows[0] ?? null,
  queryOne: vi.fn()
}))
const url = process.env.ROLE_SKILLS_PG_URL
const target = url ? new URL(url) : null
const local = !!target && ['127.0.0.1', 'localhost'].includes(target.hostname) && /^\/assistant_role_skills_test_[a-z0-9_]+$/.test(target.pathname)
describe.skipIf(!local)('specialist scope uses actual fresh role and assignment SQL', () => {
  it('matches 95-client MM scope, 93 assigned clients, Finance-only global access and next-call revocation', async () => {
    const schema = `platform_scope_${randomUUID().replaceAll('-', '')}`
    const admin = new pg.Client({ connectionString: url })
    await admin.connect()
    await admin.query(`CREATE SCHEMA ${schema}`)
    const pool = new pg.Pool({ connectionString: url, options: `-c search_path=${schema}`, statement_timeout: 5000 })
    state.pool = pool
    state.actorId = randomUUID()
    const roleId = randomUUID()
    const request = {} as H3Event
    try {
      await pool.query(`CREATE TABLE team_members(id uuid PRIMARY KEY,user_role text,custom_role_id uuid,is_active boolean DEFAULT TRUE);
        CREATE TABLE custom_roles(id uuid PRIMARY KEY,slug text,is_system boolean,is_read_only boolean DEFAULT FALSE);
        CREATE TABLE role_permission_groups(role_id uuid,permission_group text);
        CREATE TABLE agency_clients(id uuid PRIMARY KEY,is_active boolean);
        CREATE TABLE client_team_assignments(team_member_id uuid,client_id uuid);`)
      await pool.query('INSERT INTO custom_roles(id,slug,is_system) VALUES ($1,\'custom_marketing\',FALSE)', [roleId])
      await pool.query('INSERT INTO team_members VALUES ($1,\'owner\',$2,TRUE)', [state.actorId, roleId])
      await pool.query('INSERT INTO role_permission_groups VALUES ($1,\'MEDIA_BUYING\'),($1,\'MARKETING_MANAGEMENT\')', [roleId])
      const clients = (await pool.query<{ id: string, is_active: boolean }>('INSERT INTO agency_clients SELECT gen_random_uuid(),n<=95 FROM generate_series(1,96)n RETURNING id,is_active')).rows
      const active = clients.filter(client => client.is_active)
      for (const client of [...active.slice(0, 93), clients.find(client => !client.is_active)!]) {
        await pool.query('INSERT INTO client_team_assignments VALUES ($1,$2)', [state.actorId, client.id])
      }
      const management = await resolveUserPlatformAgentAuthority(request, { permissionGroups: ['MEDIA_BUYING'], tenant: 'none' })
      expect(management.allowedClientIds).toHaveLength(95)
      expect(management.allowedClientIds).toContain(active[94]!.id)
      await pool.query('DELETE FROM role_permission_groups WHERE role_id=$1 AND permission_group=\'MARKETING_MANAGEMENT\'', [roleId])
      const specialist = await resolveUserPlatformAgentAuthority(request, { permissionGroups: ['MEDIA_BUYING'], tenant: 'none' })
      expect(specialist.allowedClientIds).toHaveLength(93)
      expect(specialist.allowedClientIds).not.toContain(active[94]!.id)
      expect(specialist.allowedClientIds).not.toContain(clients.find(client => !client.is_active)!.id)
      await pool.query('DELETE FROM role_permission_groups WHERE role_id=$1', [roleId])
      await expect(resolveUserPlatformAgentAuthority(request, { permissionGroups: ['MEDIA_BUYING'], tenant: 'none' })).rejects.toMatchObject({ statusCode: 403 })
      await pool.query('INSERT INTO role_permission_groups VALUES ($1,\'FINANCE\'),($1,\'MEDIA_BUYING\')', [roleId])
      const finance = await resolveUserPlatformAgentAuthority(request, { permissionGroups: ['FINANCE'], tenant: 'none', clientAccess: 'all' })
      expect(finance.allowedClientIds).toHaveLength(95)
      const marketing = await resolveUserPlatformAgentAuthority(request, { permissionGroups: ['MEDIA_BUYING'], tenant: 'none', clientAccess: 'all' })
      expect(marketing.allowedClientIds).toHaveLength(93)
      const systemRole = randomUUID()
      await pool.query('INSERT INTO custom_roles(id,slug,is_system) VALUES ($1,\'owner\',TRUE)', [systemRole])
      await pool.query('INSERT INTO role_permission_groups VALUES ($1,\'MEDIA_BUYING\')', [systemRole])
      await pool.query('UPDATE team_members SET custom_role_id=NULL WHERE id=$1', [state.actorId])
      const systemAuthority = await resolveUserPlatformAgentAuthority(request, { permissionGroups: ['MEDIA_BUYING'], tenant: 'none' })
      expect(systemAuthority.allowedClientIds).toHaveLength(93)
      expect(systemAuthority.permissions).toEqual(['MEDIA_BUYING'])
      await expect(resolveUserPlatformAgentAuthority(request, { permissionGroups: ['ADMIN'], tenant: 'none' })).rejects.toMatchObject({ statusCode: 403 })
      await pool.query('UPDATE team_members SET custom_role_id=$2 WHERE id=$1', [state.actorId, roleId])
      await pool.query('UPDATE custom_roles SET is_read_only=TRUE WHERE id=$1', [roleId])
      await expect(resolveUserPlatformAgentAuthority(request, { permissionGroups: ['MEDIA_BUYING'], tenant: 'none', write: true })).rejects.toMatchObject({ statusCode: 403 })
      await pool.query('UPDATE team_members SET is_active=FALSE WHERE id=$1', [state.actorId])
      await expect(resolveUserPlatformAgentAuthority(request, { permissionGroups: ['MEDIA_BUYING'], tenant: 'none' })).rejects.toMatchObject({ statusCode: 403 })
    } finally {
      state.pool = null
      await pool.end()
      await admin.query(`DROP SCHEMA ${schema} CASCADE`)
      await admin.end()
    }
  })
})
