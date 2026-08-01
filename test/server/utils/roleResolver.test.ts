/**
 * Role Resolver & Custom Permissions Tests
 *
 * Tests the custom roles permission resolution pipeline:
 * - roleResolver: KV cache → DB lookup → static fallback
 * - permissionGroupForRoles: reverse-lookup PERMISSIONS → group name
 * - hasRole: legacy role match + permission group match
 * - requireWriteAccess: blocks viewer/guest + custom read-only roles
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock database
const mockQueryOne = vi.fn()
const mockQueryRows = vi.fn()

vi.mock('../../../server/utils/db', () => ({
  queryOne: (...args: any[]) => mockQueryOne(...args),
  queryRows: (...args: any[]) => mockQueryRows(...args)
}))

// Mock KV
const mockKvGet = vi.fn()
const mockKvPut = vi.fn()
const mockKvDelete = vi.fn()

vi.mock('../../../server/utils/kv', () => ({
  kvGet: (...args: any[]) => mockKvGet(...args),
  kvPut: (...args: any[]) => mockKvPut(...args),
  kvDelete: (...args: any[]) => mockKvDelete(...args)
}))

// Mock Nuxt/h3 globals
const mockGetHeader = vi.fn()
const mockGetCookie = vi.fn()
const mockCreateError = (opts: { statusCode: number; statusMessage: string }) => {
  const error = new Error(opts.statusMessage) as any
  error.statusCode = opts.statusCode
  error.statusMessage = opts.statusMessage
  return error
}

;(globalThis as any).getHeader = mockGetHeader
;(globalThis as any).getCookie = mockGetCookie
;(globalThis as any).createError = mockCreateError

vi.mock('#imports', () => ({
  getHeader: (...args: any[]) => mockGetHeader(...args),
  getCookie: (...args: any[]) => mockGetCookie(...args),
  createError: mockCreateError,
  useRuntimeConfig: () => ({
    databaseUrl: 'postgresql://test:test@localhost:5432/test_db',
    jwtSecret: 'test-secret-key'
  })
}))

// Import after mocks
import { resolveUserPermissions, invalidateUserPermissionCache, hasPermissionGroup, hasAnyPermissionGroup } from '../../../server/utils/roleResolver'
import { permissionGroupForRoles, permissionGroupsForRoles, isReadOnlyRole, PERMISSIONS, SYSTEM_ROLE_PERMISSIONS, PERMISSION_GROUPS } from '../../../server/utils/permissions'
import { hasRole, requireWriteAccess } from '../../../server/utils/auth'
import type { User } from '../../../server/utils/auth'

const mockEvent = {} as any

describe('roleResolver', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('resolveUserPermissions', () => {
    it('should return cached permissions when KV cache hit', async () => {
      const cached = {
        groups: ['ADMIN', 'MANAGEMENT', 'FINANCE'],
        customRoleId: 'role-123',
        roleName: 'Custom Admin',
        isReadOnly: false
      }
      mockKvGet.mockResolvedValue(cached)

      const result = await resolveUserPermissions(mockEvent, 'user-1', 'member', 'role-123')

      expect(result).toEqual(cached)
      expect(mockKvGet).toHaveBeenCalledWith(mockEvent, 'role-perms:user-1')
      expect(mockQueryOne).not.toHaveBeenCalled() // No DB query needed
    })

    it('should query DB by custom_role_id when provided', async () => {
      mockKvGet.mockResolvedValue(null) // Cache miss
      mockQueryOne.mockResolvedValue({
        name: 'Custom Editor',
        is_read_only: false,
        permission_groups: ['CREATIVE', 'MEDIA_BUYING']
      })

      const result = await resolveUserPermissions(mockEvent, 'user-2', 'member', 'custom-role-uuid')

      expect(result.groups).toEqual(['CREATIVE', 'MEDIA_BUYING'])
      expect(result.customRoleId).toBe('custom-role-uuid')
      expect(result.roleName).toBe('Custom Editor')
      expect(result.isReadOnly).toBe(false)
      // Should query by role ID
      expect(mockQueryOne).toHaveBeenCalledWith(
        expect.stringContaining('WHERE cr.id = $1'),
        ['custom-role-uuid']
      )
      // Should cache the result
      expect(mockKvPut).toHaveBeenCalledWith(mockEvent, 'role-perms:user-2', result, 300)
    })

    it('should query DB by system role slug when no custom_role_id', async () => {
      mockKvGet.mockResolvedValue(null)
      mockQueryOne.mockResolvedValue({
        name: 'Admin',
        is_read_only: false,
        permission_groups: ['ADMIN', 'MANAGEMENT', 'FINANCE', 'SALES', 'CLIENTS', 'CREATIVE', 'MEDIA_BUYING', 'TIME_APPROVALS', 'AUTOMATION']
      })

      const result = await resolveUserPermissions(mockEvent, 'user-3', 'admin', null)

      expect(result.groups).toContain('ADMIN')
      expect(result.customRoleId).toBeNull()
      expect(result.roleName).toBe('Admin')
      // Should query by slug + is_system
      expect(mockQueryOne).toHaveBeenCalledWith(
        expect.stringContaining('WHERE cr.slug = $1 AND cr.is_system = true'),
        ['admin']
      )
    })

    it('should fall back to static permissions when DB query returns null', async () => {
      mockKvGet.mockResolvedValue(null)
      mockQueryOne.mockResolvedValue(null) // No role found in DB

      const result = await resolveUserPermissions(mockEvent, 'user-4', 'creative', null)

      // Should use SYSTEM_ROLE_PERMISSIONS fallback
      expect(result.groups).toEqual(SYSTEM_ROLE_PERMISSIONS['creative'])
      expect(result.customRoleId).toBeNull()
      expect(result.roleName).toBe('creative')
    })

    it('should fall back to static permissions when DB throws error', async () => {
      mockKvGet.mockResolvedValue(null)
      mockQueryOne.mockRejectedValue(new Error('Connection refused'))

      const result = await resolveUserPermissions(mockEvent, 'user-5', 'finance', null)

      expect(result.groups).toEqual(SYSTEM_ROLE_PERMISSIONS['finance'])
      expect(result.roleName).toBe('finance')
    })

    it('should mark viewer as read-only in static fallback', async () => {
      mockKvGet.mockResolvedValue(null)
      mockQueryOne.mockResolvedValue(null)

      const result = await resolveUserPermissions(mockEvent, 'user-6', 'viewer', null)

      expect(result.isReadOnly).toBe(true)
      expect(result.groups).toEqual([])
    })

    it('should mark guest as read-only in static fallback', async () => {
      mockKvGet.mockResolvedValue(null)
      mockQueryOne.mockResolvedValue(null)

      const result = await resolveUserPermissions(mockEvent, 'user-7', 'guest', null)

      expect(result.isReadOnly).toBe(true)
      expect(result.groups).toEqual([])
    })

    it('should handle custom role with is_read_only=true from DB', async () => {
      mockKvGet.mockResolvedValue(null)
      mockQueryOne.mockResolvedValue({
        name: 'Observer',
        is_read_only: true,
        permission_groups: ['CLIENTS']
      })

      const result = await resolveUserPermissions(mockEvent, 'user-8', 'member', 'observer-role-id')

      expect(result.isReadOnly).toBe(true)
      expect(result.groups).toEqual(['CLIENTS'])
    })

    it('should handle empty permission_groups array from DB', async () => {
      mockKvGet.mockResolvedValue(null)
      mockQueryOne.mockResolvedValue({
        name: 'Empty Role',
        is_read_only: false,
        permission_groups: []
      })

      const result = await resolveUserPermissions(mockEvent, 'user-9', 'member', 'empty-role-id')

      expect(result.groups).toEqual([])
      expect(result.isReadOnly).toBe(false)
    })

    it('should return empty groups for unknown role in static fallback', async () => {
      mockKvGet.mockResolvedValue(null)
      mockQueryOne.mockResolvedValue(null)

      const result = await resolveUserPermissions(mockEvent, 'user-10', 'nonexistent_role', null)

      // SYSTEM_ROLE_PERMISSIONS['nonexistent_role'] → undefined → []
      expect(result.groups).toEqual([])
    })
  })

  describe('invalidateUserPermissionCache', () => {
    it('should delete the KV cache entry for the user', async () => {
      await invalidateUserPermissionCache(mockEvent, 'user-abc')

      expect(mockKvDelete).toHaveBeenCalledWith(mockEvent, 'role-perms:user-abc')
    })
  })

  describe('hasPermissionGroup', () => {
    it('should return true when group is in resolved groups', () => {
      const resolved = { groups: ['ADMIN', 'FINANCE'] as any[], customRoleId: null, roleName: 'admin', isReadOnly: false }
      expect(hasPermissionGroup(resolved, 'ADMIN')).toBe(true)
      expect(hasPermissionGroup(resolved, 'FINANCE')).toBe(true)
    })

    it('should return false when group is not in resolved groups', () => {
      const resolved = { groups: ['CREATIVE'] as any[], customRoleId: null, roleName: 'creative', isReadOnly: false }
      expect(hasPermissionGroup(resolved, 'ADMIN')).toBe(false)
      expect(hasPermissionGroup(resolved, 'FINANCE')).toBe(false)
    })
  })

  describe('hasAnyPermissionGroup', () => {
    it('should return true when any group matches', () => {
      const resolved = { groups: ['CREATIVE', 'MEDIA_BUYING'] as any[], customRoleId: null, roleName: 'test', isReadOnly: false }
      expect(hasAnyPermissionGroup(resolved, ['ADMIN', 'CREATIVE'])).toBe(true)
    })

    it('should return false when no groups match', () => {
      const resolved = { groups: ['CREATIVE'] as any[], customRoleId: null, roleName: 'test', isReadOnly: false }
      expect(hasAnyPermissionGroup(resolved, ['ADMIN', 'FINANCE'])).toBe(false)
    })
  })
})

describe('permissionGroupForRoles (singular — first match)', () => {
  it('should reverse-lookup ADMIN group', () => {
    expect(permissionGroupForRoles(PERMISSIONS.ADMIN)).toBe('ADMIN')
  })

  it('should reverse-lookup FINANCE group', () => {
    expect(permissionGroupForRoles(PERMISSIONS.FINANCE)).toBe('FINANCE')
  })

  it('should reverse-lookup SALES group', () => {
    expect(permissionGroupForRoles(PERMISSIONS.SALES)).toBe('SALES')
  })

  it('should reverse-lookup CLIENTS group', () => {
    expect(permissionGroupForRoles(PERMISSIONS.CLIENTS)).toBe('CLIENTS')
  })

  it('should reverse-lookup CREATIVE group', () => {
    expect(permissionGroupForRoles(PERMISSIONS.CREATIVE)).toBe('CREATIVE')
  })

  it('should reverse-lookup MEDIA_BUYING group', () => {
    expect(permissionGroupForRoles(PERMISSIONS.MEDIA_BUYING)).toBe('MEDIA_BUYING')
  })

  it('should return first match for shared role arrays (MANAGEMENT/TIME_APPROVALS/AUTOMATION)', () => {
    // These three groups share the same role array, so singular returns first match
    expect(permissionGroupForRoles(PERMISSIONS.MANAGEMENT)).toBe('MANAGEMENT')
    expect(permissionGroupForRoles(PERMISSIONS.TIME_APPROVALS)).toBe('MANAGEMENT')
    expect(permissionGroupForRoles(PERMISSIONS.AUTOMATION)).toBe('MANAGEMENT')
  })

  it('should return null for unknown role arrays', () => {
    expect(permissionGroupForRoles(['random_role'])).toBeNull()
  })

  it('should return null for empty array', () => {
    expect(permissionGroupForRoles([])).toBeNull()
  })

  it('should reverse-lookup the owner-only HR_ADMIN group', () => {
    expect(permissionGroupForRoles(['owner'])).toBe('HR_ADMIN')
  })
})

describe('permissionGroupsForRoles (plural — all matches)', () => {
  it('should return all matching groups for shared role arrays', () => {
    // MANAGEMENT, TIME_APPROVALS, AUTOMATION all share ['owner','admin','lead','project_manager']
    const groups = permissionGroupsForRoles(PERMISSIONS.MANAGEMENT)
    expect(groups).toContain('MANAGEMENT')
    expect(groups).toContain('TIME_APPROVALS')
    expect(groups).toContain('AUTOMATION')
    expect(groups).toHaveLength(3)
  })

  it('should return single-element array for unique role arrays', () => {
    expect(permissionGroupsForRoles(PERMISSIONS.ADMIN)).toEqual(['ADMIN'])
    expect(permissionGroupsForRoles(PERMISSIONS.FINANCE)).toEqual(['FINANCE'])
    expect(permissionGroupsForRoles(PERMISSIONS.CREATIVE)).toEqual(['CREATIVE'])
  })

  it('should return empty array for unknown role arrays', () => {
    expect(permissionGroupsForRoles(['random_role'])).toEqual([])
  })

  it('should return empty array for empty input', () => {
    expect(permissionGroupsForRoles([])).toEqual([])
  })
})

describe('isReadOnlyRole', () => {
  it('should return true for viewer', () => {
    expect(isReadOnlyRole('viewer')).toBe(true)
  })

  it('should return true for guest', () => {
    expect(isReadOnlyRole('guest')).toBe(true)
  })

  it('should return false for member', () => {
    expect(isReadOnlyRole('member')).toBe(false)
  })

  it('should return false for admin', () => {
    expect(isReadOnlyRole('admin')).toBe(false)
  })

  it('should return false for owner', () => {
    expect(isReadOnlyRole('owner')).toBe(false)
  })
})

describe('SYSTEM_ROLE_PERMISSIONS static map', () => {
  it('should give owner all 11 permission groups', () => {
    expect(SYSTEM_ROLE_PERMISSIONS['owner']).toHaveLength(11)
    for (const group of PERMISSION_GROUPS) {
      expect(SYSTEM_ROLE_PERMISSIONS['owner']).toContain(group)
    }
  })

  it('should give admin all 10 permission groups', () => {
    expect(SYSTEM_ROLE_PERMISSIONS['admin']).toHaveLength(10)
  })

  it('should give viewer zero permission groups', () => {
    expect(SYSTEM_ROLE_PERMISSIONS['viewer']).toHaveLength(0)
  })

  it('should give guest zero permission groups', () => {
    expect(SYSTEM_ROLE_PERMISSIONS['guest']).toHaveLength(0)
  })

  it('should give member zero permission groups', () => {
    expect(SYSTEM_ROLE_PERMISSIONS['member']).toHaveLength(0)
  })

  it('should give creative only CREATIVE', () => {
    expect(SYSTEM_ROLE_PERMISSIONS['creative']).toEqual(['CREATIVE'])
  })

  it('should give media_buyer only MEDIA_BUYING', () => {
    expect(SYSTEM_ROLE_PERMISSIONS['media_buyer']).toEqual(['MEDIA_BUYING'])
  })

  it('should give finance FINANCE and INVOICE_OWN_CLIENTS', () => {
    expect(SYSTEM_ROLE_PERMISSIONS['finance']).toEqual(['FINANCE', 'INVOICE_OWN_CLIENTS'])
  })

  it('should give sales SALES and CLIENTS', () => {
    expect(SYSTEM_ROLE_PERMISSIONS['sales']).toEqual(['SALES', 'CLIENTS'])
  })

  it('should give account_manager CLIENTS, MEDIA_BUYING, and INVOICE_OWN_CLIENTS', () => {
    expect(SYSTEM_ROLE_PERMISSIONS['account_manager']).toEqual(['CLIENTS', 'MEDIA_BUYING', 'INVOICE_OWN_CLIENTS'])
  })
})

describe('hasRole (legacy + permission group)', () => {
  it('should match when role is in allowedRoles (legacy path)', () => {
    const user: User = { id: '1', email: 'a@b.com', name: 'A', role: 'admin', is_active: true }
    expect(hasRole(user, ['owner', 'admin'])).toBe(true)
  })

  it('should reject when role is not in allowedRoles and no permission groups', () => {
    const user: User = { id: '1', email: 'a@b.com', name: 'A', role: 'member', is_active: true }
    expect(hasRole(user, ['owner', 'admin'])).toBe(false)
  })

  it('should match via permission group when role name does not match', () => {
    // User with custom role (role='member') but has ADMIN permission group
    const user: User = {
      id: '1', email: 'a@b.com', name: 'A', role: 'member', is_active: true,
      custom_role_id: 'custom-uuid',
      permissionGroups: ['ADMIN', 'MANAGEMENT']
    }
    // PERMISSIONS.ADMIN = ['owner', 'admin'] — role 'member' doesn't match,
    // but permissionGroupForRoles(['owner','admin']) = 'ADMIN', which is in user's groups
    expect(hasRole(user, PERMISSIONS.ADMIN)).toBe(true)
  })

  it('should match FINANCE via permission group for custom role', () => {
    const user: User = {
      id: '2', email: 'b@b.com', name: 'B', role: 'member', is_active: true,
      custom_role_id: 'finance-custom',
      permissionGroups: ['FINANCE']
    }
    expect(hasRole(user, PERMISSIONS.FINANCE)).toBe(true)
    expect(hasRole(user, PERMISSIONS.ADMIN)).toBe(false)
  })

  it('should reject when permission groups do not include the required group', () => {
    const user: User = {
      id: '3', email: 'c@b.com', name: 'C', role: 'member', is_active: true,
      custom_role_id: 'creative-only',
      permissionGroups: ['CREATIVE']
    }
    expect(hasRole(user, PERMISSIONS.FINANCE)).toBe(false)
    expect(hasRole(user, PERMISSIONS.ADMIN)).toBe(false)
  })

  it('should match TIME_APPROVALS via permission group for custom role', () => {
    // Critical: TIME_APPROVALS shares role array with MANAGEMENT — permissionGroupsForRoles
    // must return all matches so this works
    const user: User = {
      id: '4a', email: 'ta@b.com', name: 'TA', role: 'member', is_active: true,
      custom_role_id: 'time-approver',
      permissionGroups: ['TIME_APPROVALS']
    }
    expect(hasRole(user, PERMISSIONS.TIME_APPROVALS)).toBe(true)
    // But should NOT match MANAGEMENT since user only has TIME_APPROVALS
    // (they share the same role array, but the group check is against user's actual groups)
  })

  it('should match AUTOMATION via permission group for custom role', () => {
    const user: User = {
      id: '4b', email: 'auto@b.com', name: 'Auto', role: 'member', is_active: true,
      custom_role_id: 'automator',
      permissionGroups: ['AUTOMATION']
    }
    expect(hasRole(user, PERMISSIONS.AUTOMATION)).toBe(true)
  })

  it('should handle empty permissionGroups array', () => {
    const user: User = {
      id: '4', email: 'd@b.com', name: 'D', role: 'member', is_active: true,
      permissionGroups: []
    }
    expect(hasRole(user, PERMISSIONS.ADMIN)).toBe(false)
  })

  it('should handle undefined permissionGroups', () => {
    const user: User = {
      id: '5', email: 'e@b.com', name: 'E', role: 'member', is_active: true
    }
    expect(hasRole(user, PERMISSIONS.ADMIN)).toBe(false)
  })

  it('should still match legacy role even with mismatched permission groups', () => {
    // User with role='admin' but permissionGroups=['CREATIVE']
    // Legacy path should match first
    const user: User = {
      id: '6', email: 'f@b.com', name: 'F', role: 'admin', is_active: true,
      permissionGroups: ['CREATIVE']
    }
    expect(hasRole(user, PERMISSIONS.ADMIN)).toBe(true) // 'admin' in ['owner','admin']
  })
})

describe('requireWriteAccess', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should allow write for normal member', async () => {
    const mockEvt = {
      context: {
        user: { id: '1', email: 'a@b.com', name: 'A', role: 'member', is_active: true }
      }
    }
    const user = await requireWriteAccess(mockEvt)
    expect(user.id).toBe('1')
  })

  it('should block viewer role', async () => {
    const mockEvt = {
      context: {
        user: { id: '2', email: 'b@b.com', name: 'B', role: 'viewer', is_active: true }
      }
    }
    await expect(requireWriteAccess(mockEvt)).rejects.toMatchObject({
      statusCode: 403,
      statusMessage: expect.stringContaining('Read-only')
    })
  })

  it('should block guest role', async () => {
    const mockEvt = {
      context: {
        user: { id: '3', email: 'c@b.com', name: 'C', role: 'guest', is_active: true }
      }
    }
    await expect(requireWriteAccess(mockEvt)).rejects.toMatchObject({
      statusCode: 403
    })
  })

  it('should block custom read-only role (isCustomReadOnly=true)', async () => {
    const mockEvt = {
      context: {
        user: { id: '4', email: 'd@b.com', name: 'D', role: 'member', is_active: true, isCustomReadOnly: true }
      }
    }
    await expect(requireWriteAccess(mockEvt)).rejects.toMatchObject({
      statusCode: 403,
      statusMessage: expect.stringContaining('Read-only')
    })
  })

  it('should allow write for custom role that is NOT read-only', async () => {
    const mockEvt = {
      context: {
        user: { id: '5', email: 'e@b.com', name: 'E', role: 'member', is_active: true, isCustomReadOnly: false }
      }
    }
    const user = await requireWriteAccess(mockEvt)
    expect(user.id).toBe('5')
  })

  it('should allow write for admin even if isCustomReadOnly absent', async () => {
    const mockEvt = {
      context: {
        user: { id: '6', email: 'f@b.com', name: 'F', role: 'admin', is_active: true }
      }
    }
    const user = await requireWriteAccess(mockEvt)
    expect(user.role).toBe('admin')
  })
})
