import { readRoleSkillAdminRoles } from '~~/server/utils/ai/roleSkills/admin'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { describe, expect, it } from 'vitest'
import { resolveRoleSkillActor } from '~~/server/utils/ai/roleSkills/eligibility'
import type { H3Event } from 'h3'
import { publishRoleSkillVersion, readRoleSkillCatalogue, readActiveRoleSkills, saveRoleSkillDraft, type RoleSkillStore } from '~~/server/utils/ai/roleSkills/store'

const url = process.env.ROLE_SKILLS_PG_URL
const target = url ? new URL(url) : null
const local = !!target && ['127.0.0.1', 'localhost'].includes(target.hostname) && /^\/assistant_role_skills_test_[a-z0-9_]+$/.test(target.pathname)
describe.skipIf(!local)('curated workflows in isolated local PostgreSQL', () => {
  it('keeps published snapshots immutable, serializes drafts and audits explicit publish under optimistic concurrency', async () => {
    const schema = `role_skills_${randomUUID().replaceAll('-', '')}`
    const admin = new pg.Client({ connectionString: url })
    await admin.connect()
    await admin.query(`CREATE SCHEMA ${schema}`)
    const pool = new pg.Pool({ connectionString: url, max: 4, options: `-c search_path=${schema}`, statement_timeout: 5000 })
    const store: RoleSkillStore = {
      rows: async (sql, params) => (await pool.query(sql, params)).rows,
      transaction: async (fn) => {
        const client = await pool.connect()
        try {
          await client.query('BEGIN')
          const result = await fn(client)
          await client.query('COMMIT')
          return result
        } catch (error) {
          await client.query('ROLLBACK')
          throw error
        } finally { client.release() }
      }
    }
    try {
      const migration = readFileSync('server/database/migrations/505_assistant_role_skills.sql', 'utf8')
      await pool.query(migration)
      await pool.query(migration)
      await pool.query('CREATE TABLE custom_roles (id uuid PRIMARY KEY,name text,slug text,is_system boolean,is_read_only boolean DEFAULT FALSE,sort_order integer DEFAULT 0)')
      await pool.query(`CREATE TABLE team_members(id uuid PRIMARY KEY,user_role text,custom_role_id uuid,is_active boolean DEFAULT TRUE);
        CREATE TABLE role_permission_groups(role_id uuid,permission_group text)`)
      const memberId = randomUUID(), systemId = randomUUID(), customId = randomUUID()
      await pool.query(`INSERT INTO custom_roles(id,name,slug,is_system) VALUES ($1,'Owner','owner',TRUE),($2,'Limited marketing','limited',FALSE);
        `, [systemId, customId])
      await pool.query('INSERT INTO role_permission_groups VALUES ($1,\'FINANCE\'),($2,\'MEDIA_BUYING\')', [systemId, customId])
      await pool.query('INSERT INTO team_members VALUES ($1,\'owner\',$2,TRUE)', [memberId, customId])
      const roles = await readRoleSkillAdminRoles(store.rows)
      expect(roles.find(role => role.id === systemId)?.permissionGroups).toEqual(['FINANCE'])
      expect(roles.find(role => role.id === customId)?.permissionGroups).toEqual(['MEDIA_BUYING'])
      const actorDeps = { authenticate: async () => ({ id: memberId }) as Awaited<ReturnType<typeof import('~~/server/utils/auth').requireAuth>>, rows: store.rows }
      const actor = await resolveRoleSkillActor({} as H3Event, memberId, actorDeps)
      expect(actor.permissionGroups).toEqual(['MEDIA_BUYING'])
      expect(actor.permissionGroups).not.toContain('FINANCE')
      await pool.query('DELETE FROM role_permission_groups WHERE role_id=$1', [customId])
      expect((await resolveRoleSkillActor({} as H3Event, memberId, actorDeps)).permissionGroups).toEqual([])
      expect((await readRoleSkillAdminRoles(store.rows)).find(role => role.id === customId)?.permissionGroups).toEqual([])
      await pool.query('UPDATE team_members SET is_active=FALSE WHERE id=$1', [memberId])
      await expect(resolveRoleSkillActor({} as H3Event, memberId, actorDeps)).rejects.toMatchObject({ statusCode: 403 })
      const original = (await readRoleSkillCatalogue(store)).find(workflow => workflow.key === 'marketing_budget_health')!
      expect(original.active?.version).toBe(1)
      expect((await readRoleSkillCatalogue(store))).toHaveLength(16)
      const actorId = randomUUID()
      const body = { expectedRevision: original.revision, label: 'Revised budget check', description: 'A tailored team request', prompt: 'Ask for the client and period, then inspect stored budget health.',
        enabled: true, bindings: { allRoles: false, roleIds: [], systemRoles: [], permissionGroups: ['MEDIA_BUYING'] }, reason: 'Clarify required client context' }
      await expect(saveRoleSkillDraft(original.key, { ...body, bindings: { ...body.bindings, roleIds: [randomUUID()] } }, actorId, store)).rejects.toMatchObject({ statusCode: 400 })
      expect((await readRoleSkillCatalogue(store)).find(workflow => workflow.key === original.key)?.revision).toBe(original.revision)
      const attempts = await Promise.allSettled([saveRoleSkillDraft(original.key, body, actorId, store), saveRoleSkillDraft(original.key, body, actorId, store)])
      expect(attempts.filter(result => result.status === 'fulfilled')).toHaveLength(1)
      expect(attempts.filter(result => result.status === 'rejected')).toHaveLength(1)
      const drafted = (await readRoleSkillCatalogue(store)).find(workflow => workflow.key === original.key)!
      expect(drafted.active).toEqual(original.active)
      expect((await readActiveRoleSkills(store)).find(workflow => workflow.key === original.key)?.active?.prompt).toBe(original.active?.prompt)
      expect(drafted.draft?.label).toBe(body.label)
      expect(drafted.history).toHaveLength(2)
      const published = await publishRoleSkillVersion(original.key, { expectedRevision: drafted.revision, versionId: drafted.draft!.id, reason: 'Reviewed and ready for the media team' }, actorId, store)
      expect(published.active?.label).toBe(body.label)
      expect(published.history.find(version => version.id === original.active!.id)?.prompt).toBe(original.active!.prompt)
      expect(published.active?.publishedBy).toBe(actorId)
      await expect(publishRoleSkillVersion(original.key, { expectedRevision: drafted.revision, versionId: original.active!.id, reason: 'Stale competing publication' }, actorId, store)).rejects.toMatchObject({ statusCode: 409 })
      await expect(pool.query('UPDATE assistant_role_skill_versions SET prompt=$2 WHERE id=$1', [original.active!.id, 'Changed behind publication'])).rejects.toThrow('immutable')
      await expect(pool.query('DELETE FROM assistant_role_skill_publications WHERE workflow_key=$1', [original.key])).rejects.toThrow('immutable')
      const disabled = await saveRoleSkillDraft(original.key, { ...body, expectedRevision: published.revision, enabled: false, reason: 'Temporarily disable after review' }, actorId, store)
      expect(disabled.active?.enabled).toBe(true)
      const retired = await publishRoleSkillVersion(original.key, { expectedRevision: disabled.revision, versionId: disabled.draft!.id, reason: 'Publish reviewed disabled snapshot' }, actorId, store)
      expect(retired.active?.enabled).toBe(false)
      await pool.query(migration)
      expect((await readRoleSkillCatalogue(store)).find(workflow => workflow.key === original.key)?.active?.enabled).toBe(false)
      expect((await pool.query('SELECT COUNT(*)::int AS n FROM role_permission_groups')).rows[0].n).toBe(1)
      expect((await readActiveRoleSkills(store)).some(workflow => workflow.key === original.key)).toBe(false)
      expect((await pool.query('SELECT COUNT(*)::int AS n FROM assistant_role_skill_publications WHERE workflow_key=$1', [original.key])).rows[0].n).toBe(3)
    } finally {
      await pool.end()
      await admin.query(`DROP SCHEMA ${schema} CASCADE`)
      await admin.end()
    }
  })
})
