import { describe, expect, it } from 'vitest'
import {
  PERMISSION_GROUPS, PERMISSIONS, SYSTEM_ROLE_PERMISSIONS,
  permissionGroupsForRoles, roleHasPermission, type PermissionGroup
} from '~~/server/utils/permissions'

const studioGroups = [
  'PAGE_STUDIO_VIEW', 'PAGE_STUDIO_EDIT', 'PAGE_STUDIO_APPROVE',
  'PAGE_STUDIO_PUBLISH', 'PAGE_STUDIO_DOMAINS', 'PAGE_STUDIO_SUBSCRIPTIONS'
] as const

describe('Website Builder permission registration', () => {
  it('accepts every Website Builder capability in role administration validation', () => {
    expect(studioGroups.filter(group => !(PERMISSION_GROUPS as readonly string[]).includes(group))).toEqual([])
  })

  it.each(['owner', 'admin'])('preserves %s website access when system-role resolution uses its fallback', (role) => {
    expect(SYSTEM_ROLE_PERMISSIONS[role]).toEqual(expect.arrayContaining(studioGroups))
  })

  it.each(['creative', 'producer', 'account_manager'])('limits %s fallback to website viewing and editing', (role) => {
    expect(SYSTEM_ROLE_PERMISSIONS[role].filter(group => group.startsWith('PAGE_STUDIO_')))
      .toEqual(['PAGE_STUDIO_VIEW', 'PAGE_STUDIO_EDIT'])
  })

  it('does not grant finance, sales or read-only roles website mutation capabilities', () => {
    for (const role of ['finance', 'accounts', 'sales', 'member', 'viewer', 'guest']) {
      expect(SYSTEM_ROLE_PERMISSIONS[role].filter(group => group.startsWith('PAGE_STUDIO_'))).toEqual([])
    }
  })

  it('keeps website capabilities out of legacy role-array authorization', () => {
    expect(permissionGroupsForRoles(PERMISSIONS.ADMIN)).toEqual(['ADMIN'])
    expect(permissionGroupsForRoles(PERMISSIONS.CREATIVE)).toEqual(['CREATIVE'])
    for (const group of studioGroups) {
      expect(roleHasPermission('owner', group as PermissionGroup)).toBe(false)
      expect(roleHasPermission('custom-role', group as PermissionGroup)).toBe(false)
    }
    expect(roleHasPermission('admin', 'ADMIN')).toBe(true)
    expect(roleHasPermission('member', 'ADMIN')).toBe(false)
  })
})
