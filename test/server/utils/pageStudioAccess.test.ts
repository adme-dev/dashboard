import { beforeEach, describe, expect, it, vi } from 'vitest'
import { requireAgencyPageStudioAccess } from '~~/server/utils/pageStudio/access'

const mockRequireAuth = vi.fn()
const mockGetSelectedTenant = vi.fn()
const mockResolveUserPermissions = vi.fn()

vi.mock('~~/server/utils/auth', () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args)
}))

vi.mock('~~/server/utils/session', () => ({
  getSelectedTenant: (...args: unknown[]) => mockGetSelectedTenant(...args)
}))

vi.mock('~~/server/utils/roleResolver', () => ({
  resolveUserPermissions: (...args: unknown[]) => mockResolveUserPermissions(...args)
}))

const testGlobal = globalThis as typeof globalThis & {
  createError: (input: { statusCode: number, statusMessage: string }) => Error & {
    statusCode: number
    statusMessage: string
  }
}

testGlobal.createError = input => Object.assign(new Error(input.statusMessage), input)

describe('requireAgencyPageStudioAccess', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireAuth.mockResolvedValue({
      id: 'user-1',
      role: 'project_manager',
      is_active: true,
      permissionGroups: ['PAGE_STUDIO_VIEW', 'PAGE_STUDIO_EDIT']
    })
    mockGetSelectedTenant.mockResolvedValue('tenant-alpha')
  })

  it('returns the authenticated actor and selected tenant for an explicit capability', async () => {
    const event = { context: {} } as never

    await expect(requireAgencyPageStudioAccess(event, 'PAGE_STUDIO_EDIT')).resolves.toEqual({
      tenantId: 'tenant-alpha',
      user: expect.objectContaining({ id: 'user-1' })
    })
  })

  it('denies a viewer even when another Page Studio group is present', async () => {
    mockRequireAuth.mockResolvedValue({
      id: 'viewer-1',
      role: 'viewer',
      is_active: true,
      permissionGroups: ['PAGE_STUDIO_VIEW']
    })

    await expect(
      requireAgencyPageStudioAccess({ context: {} } as never, 'PAGE_STUDIO_EDIT')
    ).rejects.toMatchObject({ statusCode: 403 })
  })

  it('does not infer a Page Studio group from an identical legacy role array', async () => {
    mockRequireAuth.mockResolvedValue({
      id: 'custom-1',
      role: 'member',
      custom_role_id: 'custom-role',
      is_active: true,
      permissionGroups: ['ADMIN']
    })

    await expect(
      requireAgencyPageStudioAccess({ context: {} } as never, 'PAGE_STUDIO_DOMAINS')
    ).rejects.toMatchObject({ statusCode: 403 })
  })

  it('resolves missing permission groups before enforcing the capability', async () => {
    mockRequireAuth.mockResolvedValue({
      id: 'user-2',
      role: 'creative',
      custom_role_id: null,
      is_active: true
    })
    mockResolveUserPermissions.mockResolvedValue({
      groups: ['CREATIVE', 'PAGE_STUDIO_VIEW', 'PAGE_STUDIO_EDIT'],
      isReadOnly: false,
      customRoleId: null,
      roleName: 'Creative'
    })

    await expect(
      requireAgencyPageStudioAccess({ context: {} } as never, 'PAGE_STUDIO_EDIT')
    ).resolves.toMatchObject({ tenantId: 'tenant-alpha' })
    expect(mockResolveUserPermissions).toHaveBeenCalledWith(
      expect.anything(),
      'user-2',
      'creative',
      null
    )
  })

  it('fails closed when no tenant is selected', async () => {
    mockGetSelectedTenant.mockResolvedValue(undefined)

    await expect(
      requireAgencyPageStudioAccess({ context: {} } as never, 'PAGE_STUDIO_VIEW')
    ).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'No organization selected'
    })
  })
})
