import type { H3Event } from 'h3'
import { kvGet, kvPut, kvDelete } from './kv'
import { queryOne } from './db'
import { SYSTEM_ROLE_PERMISSIONS, type PermissionGroup } from './permissions'

export interface ResolvedPermissions {
  groups: PermissionGroup[]
  customRoleId: string | null
  roleName: string
  isReadOnly: boolean
}

/**
 * Resolve a user's permission groups from their custom role or system role.
 * Uses KV cache (5min TTL) → DB lookup → static fallback.
 */
export async function resolveUserPermissions(
  event: H3Event,
  userId: string,
  userRole: string,
  customRoleId?: string | null
): Promise<ResolvedPermissions> {
  const cacheKey = `role-perms:${userId}`
  const cached = await kvGet<ResolvedPermissions>(event, cacheKey)
  if (cached) return cached

  let resolved: ResolvedPermissions

  if (customRoleId) {
    try {
      const role = await queryOne<{ name: string; is_read_only: boolean; permission_groups: string[] }>(
        `SELECT cr.name, cr.is_read_only,
           COALESCE(
             array_agg(rpg.permission_group) FILTER (WHERE rpg.permission_group IS NOT NULL),
             '{}'
           ) AS permission_groups
         FROM custom_roles cr
         LEFT JOIN role_permission_groups rpg ON rpg.role_id = cr.id
         WHERE cr.id = $1
         GROUP BY cr.id`,
        [customRoleId]
      )

      if (role) {
        resolved = {
          groups: role.permission_groups as PermissionGroup[],
          customRoleId,
          roleName: role.name,
          isReadOnly: role.is_read_only
        }
      } else {
        resolved = staticFallback(userRole)
      }
    } catch {
      resolved = staticFallback(userRole)
    }
  } else {
    resolved = staticFallback(userRole)
  }

  // Cache for 5 minutes (fire-and-forget)
  kvPut(event, cacheKey, resolved, 300)
  return resolved
}

function staticFallback(userRole: string): ResolvedPermissions {
  return {
    groups: SYSTEM_ROLE_PERMISSIONS[userRole] || [],
    customRoleId: null,
    roleName: userRole,
    isReadOnly: userRole === 'viewer' || userRole === 'guest'
  }
}

/**
 * Invalidate a user's permission cache. Call after role changes.
 */
export async function invalidateUserPermissionCache(event: H3Event, userId: string): Promise<void> {
  await kvDelete(event, `role-perms:${userId}`)
}

export function hasPermissionGroup(resolved: ResolvedPermissions, group: PermissionGroup): boolean {
  return resolved.groups.includes(group)
}

export function hasAnyPermissionGroup(resolved: ResolvedPermissions, groups: PermissionGroup[]): boolean {
  return groups.some(g => resolved.groups.includes(g))
}
