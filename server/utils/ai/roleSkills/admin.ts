import { createError, type H3Event } from 'h3'
import { ZodError } from 'zod'
import { requireAuth } from '~~/server/utils/auth'
import { assertPermissionGrant } from '~~/server/utils/financeAccess'
import { queryRowsFresh } from '~~/server/utils/db'
import { PERMISSION_GROUPS } from '~~/server/utils/permissions'
import type { RoleSkillAdminList } from '~~/shared/types/roleSkills'
import { readRoleSkillCatalogue, saveRoleSkillDraft, publishRoleSkillVersion } from './store'

export interface RoleSkillAdminDependencies {
  authenticate: typeof requireAuth
  assertAdmin: (event: H3Event, userId: string, write: boolean) => Promise<void>
  catalogue: typeof readRoleSkillCatalogue
  roles: () => Promise<RoleSkillAdminList['roles']>
  saveDraft: typeof saveRoleSkillDraft
  publish: typeof publishRoleSkillVersion
}
/** Read-only role coverage metadata; current DB grants never come from legacy role defaults. */
export async function readRoleSkillAdminRoles(rows = queryRowsFresh): Promise<RoleSkillAdminList['roles']> {
  return (await rows<{ id: string, name: string, slug: string, is_system: boolean, permission_groups: string[] }>(
    `SELECT cr.id::text,cr.name,cr.slug,cr.is_system,
      COALESCE(array_agg(DISTINCT rpg.permission_group ORDER BY rpg.permission_group)
        FILTER (WHERE rpg.permission_group IS NOT NULL),'{}') AS permission_groups
      FROM custom_roles cr LEFT JOIN role_permission_groups rpg ON rpg.role_id=cr.id
      GROUP BY cr.id ORDER BY cr.sort_order,cr.name`
  )).map(row => ({ id: row.id, name: row.name, slug: row.slug, isSystem: row.is_system, permissionGroups: row.permission_groups }))
}
const defaultDependencies: RoleSkillAdminDependencies = {
  authenticate: requireAuth,
  assertAdmin: (event, userId, write) => assertPermissionGrant(event, userId, 'ADMIN', write),
  catalogue: readRoleSkillCatalogue, saveDraft: saveRoleSkillDraft, publish: publishRoleSkillVersion,
  roles: readRoleSkillAdminRoles
}
function typedError(error: unknown): never {
  if (error instanceof ZodError) throw createError({ statusCode: 400, statusMessage: 'Invalid workflow changes' })
  throw error
}
export function createRoleSkillAdminHandlers(overrides: Partial<RoleSkillAdminDependencies> = {}) {
  const deps = { ...defaultDependencies, ...overrides }
  return {
    async list(event: H3Event): Promise<RoleSkillAdminList> {
      const user = await deps.authenticate(event)
      await deps.assertAdmin(event, user.id, false)
      const [workflows, roles] = await Promise.all([deps.catalogue(), deps.roles()])
      return { workflows, roles, permissionGroups: [...PERMISSION_GROUPS] }
    },
    async saveDraft(event: H3Event, key: string, body: unknown) {
      const user = await deps.authenticate(event)
      await deps.assertAdmin(event, user.id, true)
      try {
        return await deps.saveDraft(key, body, user.id)
      } catch (error) {
        return typedError(error)
      }
    },
    async publish(event: H3Event, key: string, body: unknown) {
      const user = await deps.authenticate(event)
      await deps.assertAdmin(event, user.id, true)
      try {
        return await deps.publish(key, body, user.id)
      } catch (error) {
        return typedError(error)
      }
    }
  }
}
